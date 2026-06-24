/**
 * Edge Function Supabase — confirm-deposit
 *
 * Ferme la boucle d'acompte Kkiapay CÔTÉ SERVEUR. Le client (page recap) ne peut
 * écrire que deposit_status 'none'/'pending' (RLS + trigger lock_reservation_
 * sensitive_fields) : le passage à 'paid' et l'enregistrement du transactionId
 * doivent être faits par le serveur APRÈS vérification réelle du paiement.
 *
 * Sans cette vérification auprès de Kkiapay, marquer 'paid' depuis le client
 * recréerait exactement la faille « forger un paiement » que le trigger empêche.
 * Ici on VÉRIFIE la transaction (API Kkiapay) et on ne marque 'paid' que si elle
 * est réellement SUCCESS, d'un montant suffisant, et non déjà utilisée ailleurs.
 *
 * Corps attendu (POST JSON) : { reservationId: uuid, transactionId: string }
 * Réponse 200 : { ok: true, status: 'paid' | 'already_paid' }
 *
 * Déploiement (manuel, comme les migrations) :
 *   supabase functions deploy confirm-deposit --no-verify-jwt
 *   (invocable par les RÉSERVATIONS INVITÉ, sans compte ; la sécurité ne vient
 *    pas d'un JWT mais de la vérification Kkiapay + montant + usage unique.)
 *
 * Secrets requis :
 *   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (fournis par la plateforme)
 *   - KKIAPAY_PUBLIC_KEY, KKIAPAY_PRIVATE_KEY, KKIAPAY_SECRET_KEY  (à poser :
 *       supabase secrets set KKIAPAY_PUBLIC_KEY=... KKIAPAY_PRIVATE_KEY=... KKIAPAY_SECRET_KEY=...)
 *   - KKIAPAY_SANDBOX = 'true' | 'false'  (défaut 'false' = API prod ; doit
 *       correspondre au mode du widget qui a encaissé — preprod = 'true').
 *
 * Tant que les 3 clés Kkiapay ne sont pas posées, la fonction répond 503 et ne
 * marque RIEN 'paid' (fail-safe : pas pire que l'état actuel, jamais de faux paid).
 */
// @ts-ignore - deno runtime
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
// @ts-ignore - esm
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// @ts-ignore - Deno global
const env = (key: string): string | undefined =>
  (typeof Deno !== 'undefined' ? Deno.env.get(key) : undefined);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Part d'acompte attendue : 20 % de l'estimation (cf. recap.astro `Math.round(total*0.2)`). */
const DEPOSIT_RATE = 0.2;
/** Tolérance sur le montant vérifié (arrondis / frais éventuels). */
const AMOUNT_TOLERANCE = 0.95;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405);

  const SUPABASE_URL = env('SUPABASE_URL');
  const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('confirm-deposit : SUPABASE_URL / SERVICE_ROLE_KEY manquants');
    return json({ error: 'Serveur mal configuré' }, 500);
  }

  const KKIAPAY_PUBLIC = env('KKIAPAY_PUBLIC_KEY');
  const KKIAPAY_PRIVATE = env('KKIAPAY_PRIVATE_KEY');
  const KKIAPAY_SECRET = env('KKIAPAY_SECRET_KEY');
  if (!KKIAPAY_PUBLIC || !KKIAPAY_PRIVATE || !KKIAPAY_SECRET) {
    // Fail-safe : sans les clés, on ne peut pas vérifier → on ne marque jamais 'paid'.
    console.error('confirm-deposit : clés Kkiapay (PUBLIC/PRIVATE/SECRET) manquantes — vérification impossible');
    return json({ error: 'Vérification de paiement indisponible (configuration serveur incomplète).' }, 503);
  }
  const sandbox = env('KKIAPAY_SANDBOX') === 'true';
  const apiBase = sandbox ? 'https://api-sandbox.kkiapay.me' : 'https://api.kkiapay.me';

  // 1) Parsing + validation du corps.
  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'JSON invalide' }, 400); }
  const reservationId = String(body?.reservationId ?? '').trim();
  const transactionId = String(body?.transactionId ?? '').trim();
  if (!UUID_RE.test(reservationId)) return json({ error: 'reservationId invalide' }, 400);
  if (!transactionId || transactionId.length > 128) return json({ error: 'transactionId invalide' }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 2) Réservation cible.
  const { data: resa, error: resaErr } = await admin
    .from('reservations')
    .select('id, estimated_total_xof, deposit_status, deposit_kkiapay_tx')
    .eq('id', reservationId)
    .maybeSingle();
  if (resaErr) {
    console.error('confirm-deposit : lecture résa', resaErr.message);
    return json({ error: 'Erreur serveur' }, 500);
  }
  if (!resa) return json({ error: 'Réservation introuvable' }, 404);

  // Idempotence : déjà payée avec ce même tx → succès sans rien refaire.
  if (resa.deposit_status === 'paid' && resa.deposit_kkiapay_tx === transactionId) {
    return json({ ok: true, status: 'already_paid' });
  }
  // Déjà payée avec un AUTRE tx → refus (ne pas écraser un acompte légitime).
  if (resa.deposit_status === 'paid') {
    return json({ error: 'Réservation déjà payée' }, 409);
  }

  // 3) Usage unique : ce transactionId n'est pas déjà rattaché à une AUTRE réservation.
  const { data: reused } = await admin
    .from('reservations')
    .select('id')
    .eq('deposit_kkiapay_tx', transactionId)
    .neq('id', reservationId)
    .limit(1)
    .maybeSingle();
  if (reused) return json({ error: 'Transaction déjà utilisée pour une autre réservation' }, 409);

  // 4) VÉRIFICATION Kkiapay (la barrière qui empêche de forger un paiement).
  let verified: any;
  try {
    const r = await fetch(`${apiBase}/api/v1/transactions/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': KKIAPAY_PUBLIC,
        'x-private-key': KKIAPAY_PRIVATE,
        'x-secret-key': KKIAPAY_SECRET,
      },
      body: JSON.stringify({ transactionId }),
    });
    if (!r.ok) {
      console.warn('confirm-deposit : Kkiapay status HTTP', r.status);
      return json({ error: 'Transaction non vérifiable auprès de Kkiapay' }, 402);
    }
    verified = await r.json();
  } catch (e: any) {
    console.error('confirm-deposit : appel Kkiapay échoué', e?.message);
    return json({ error: 'Service de paiement injoignable' }, 502);
  }

  const txStatus = String(verified?.status ?? '').toUpperCase();
  const txAmount = Number(verified?.amount ?? 0);
  if (txStatus !== 'SUCCESS') {
    return json({ error: `Paiement non confirmé (statut Kkiapay : ${txStatus || 'inconnu'})` }, 402);
  }

  // Liaison paiement ↔ réservation : la page a passé reservationId dans le champ
  // `data` du widget. L'API Kkiapay /transactions/status le renvoie sous `state`
  // (et/ou `data` selon la version) ; s'il est présent on EXIGE la correspondance
  // (empêche d'utiliser un paiement fait pour une AUTRE réservation). Absent → on
  // retombe sur montant + usage unique (index unique sur le tx).
  const txDataRaw = verified?.state ?? verified?.data;
  const txData = txDataRaw != null ? String(txDataRaw) : '';
  if (txData && txData !== reservationId) {
    return json({ error: 'Transaction non liée à cette réservation' }, 409);
  }

  // 5) Montant suffisant : au moins ~20 % de l'estimation (avec petite tolérance).
  const total = Number(resa.estimated_total_xof ?? 0);
  const expected = Math.round(total * DEPOSIT_RATE);
  // Plancher absolu : empêche qu'une résa au montant truqué très bas (estimated_total_xof
  // est posé côté client) passe 'paid' avec un paiement dérisoire.
  const minAmount = Math.max(Math.floor(expected * AMOUNT_TOLERANCE), 100);
  if (!(txAmount > 0 && txAmount >= minAmount)) {
    console.warn(`confirm-deposit : montant insuffisant tx=${txAmount} attendu>=${minAmount} (résa ${reservationId})`);
    return json({ error: 'Montant du paiement insuffisant' }, 402);
  }

  // 6) Tout est vérifié → on marque 'paid' + on enregistre le tx (service_role :
  //    le trigger lock_reservation_sensitive_fields laisse passer le service_role).
  const { error: updErr } = await admin
    .from('reservations')
    .update({ deposit_status: 'paid', deposit_kkiapay_tx: transactionId })
    .eq('id', reservationId);
  if (updErr) {
    // Course gagnée par une autre requête sur le même tx (index unique partiel
    // reservations_deposit_tx_unique) → conflit, pas une erreur serveur.
    if ((updErr as any).code === '23505') {
      return json({ error: 'Transaction déjà utilisée pour une autre réservation' }, 409);
    }
    console.error('confirm-deposit : update', updErr.message);
    return json({ error: 'Échec de l’enregistrement du paiement' }, 500);
  }

  return json({ ok: true, status: 'paid' });
});
