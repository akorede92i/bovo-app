/**
 * Edge Function Supabase — send-push
 *
 * Envoie des notifications push via Firebase Cloud Messaging (HTTP v1).
 * Les jetons d'appareils sont lus dans la table `device_tokens`.
 *
 * DEUX MODES :
 *  1. Webhook DB (suivi de réservation) — déclenché sur UPDATE de `reservations`.
 *     Payload Supabase : { type:'UPDATE', table:'reservations', record, old_record }.
 *     Si `status` a changé vers un état notifiable, envoie un push au client (user_id).
 *  2. Appel direct (rappels / promos) — POST JSON :
 *     { userId?, userIds?, title, body, data?, channel? }  (channel: 'transactional'|'marketing')
 *     Réservé au service_role (header Authorization: Bearer <SERVICE_ROLE_KEY>).
 *
 * SECRETS À CONFIGURER :
 *   supabase secrets set FCM_SERVICE_ACCOUNT='<contenu JSON de la clé de compte de service Firebase>'
 *   (Firebase Console → Paramètres du projet → Comptes de service → Générer une clé privée)
 *   SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement par la plateforme.
 *
 * DÉPLOIEMENT :
 *   supabase functions deploy send-push
 *   Puis Database → Webhooks : table=reservations, events=UPDATE, URL=.../functions/v1/send-push,
 *   Header Authorization: Bearer <SERVICE_ROLE_KEY>.
 *
 * AUTORISATION (#8) : la fonction EXIGE `Authorization: Bearer <SERVICE_ROLE_KEY>`
 * pour les deux modes (vérifié dans le code). Déployable avec `--no-verify-jwt`
 * sans risque ; le webhook DB doit envoyer ce header (cf. ci-dessus).
 */
// @ts-ignore - deno runtime
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
// @ts-ignore - deno runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { coerceData, classifyFcmFailure, isServiceRoleAuthorized, messageForStatus } from './lib.ts';

// @ts-ignore Deno global
const env = (k: string) => (typeof Deno !== 'undefined' ? Deno.env.get(k) : undefined);

// ---- FCM HTTP v1 : obtention d'un access token OAuth2 depuis le service account ----
function b64url(input: ArrayBuffer | string): string {
  let bytes: Uint8Array;
  if (typeof input === 'string') bytes = new TextEncoder().encode(input);
  else bytes = new Uint8Array(input);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\s+/g, '');
  const bin = atob(body);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

let cachedToken: { token: string; exp: number } | null = null;

async function getAccessToken(sa: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp > now + 60) return cachedToken.token;

  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${b64url(sig)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const json = await res.json();
  if (!json.access_token) throw new Error('OAuth token error: ' + JSON.stringify(json));
  cachedToken = { token: json.access_token, exp: now + 3500 };
  return json.access_token;
}

// Envoie un message à un token. Renvoie 'ok' | 'invalid' (token à supprimer) | 'error'.
async function sendOne(
  accessToken: string,
  projectId: string,
  token: string,
  title: string,
  body: string,
  data: Record<string, string>,
): Promise<'ok' | 'invalid' | 'error'> {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        notification: { title, body },
        data,
        android: { priority: 'high', notification: { sound: 'default' } },
        apns: { payload: { aps: { sound: 'default' } } },
      },
    }),
  });
  if (res.ok) return 'ok';
  // #8 — ne purger que sur un token réellement mort ; jamais sur une erreur
  // ambiguë (ex. message malformé) qui supprimerait un token encore valide.
  const text = await res.text();
  const verdict = classifyFcmFailure(res.status, text);
  if (verdict === 'error') console.error('FCM error', res.status, text);
  return verdict;
}

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  // #8 — Garde d'autorisation : les DEUX modes (webhook DB + appel direct) sont
  // réservés au service_role. Sans ce contrôle, n'importe qui (la clé anon étant
  // publique) pouvait forger un push vers n'importe quel utilisateur.
  if (!isServiceRoleAuthorized(req.headers.get('Authorization'), env('SUPABASE_SERVICE_ROLE_KEY'))) {
    return new Response('Unauthorized', { status: 401 });
  }

  const saRaw = env('FCM_SERVICE_ACCOUNT');
  if (!saRaw) return new Response('FCM_SERVICE_ACCOUNT not set', { status: 500 });
  const sa = JSON.parse(saRaw);
  const projectId = sa.project_id;

  const supabase = createClient(env('SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY')!);

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  // Résoudre la cible + le message selon le mode.
  let targetUserIds: string[] = [];
  let title = '';
  let body = '';
  let data: Record<string, string> = {};
  let channel: 'transactional' | 'marketing' = 'transactional';

  if (payload.type === 'UPDATE' && payload.table === 'reservations') {
    // Mode webhook : suivi de réservation
    const rec = payload.record;
    const old = payload.old_record;
    if (!rec?.user_id) return new Response(JSON.stringify({ skipped: 'guest reservation (no user)' }), { status: 200 });
    if (rec.status === old?.status) return new Response(JSON.stringify({ skipped: 'status unchanged' }), { status: 200 });
    const msg = messageForStatus(rec.status, rec.service_type);
    if (!msg) return new Response(JSON.stringify({ skipped: `status ${rec.status} not notifiable` }), { status: 200 });
    title = msg.title;
    body = msg.body;
    data = coerceData({ type: 'reservation', reservationId: rec.id, status: rec.status, url: '/compte/reservations/' });
    targetUserIds = [rec.user_id];
    channel = 'transactional';
  } else if (payload.title && payload.body) {
    // Mode direct : rappels / promos
    title = String(payload.title);
    body = String(payload.body);
    data = coerceData(payload.data);
    channel = payload.channel === 'marketing' ? 'marketing' : 'transactional';
    if (payload.userId) targetUserIds = [String(payload.userId)];
    else if (Array.isArray(payload.userIds)) targetUserIds = payload.userIds.map(String);
    else return new Response('userId or userIds required', { status: 400 });
  } else {
    return new Response('Unrecognized payload', { status: 400 });
  }

  // Récupérer les tokens (en respectant l'opt-in du canal).
  const optInColumn = channel === 'marketing' ? 'allow_marketing' : 'allow_transactional';
  const { data: tokens, error } = await supabase
    .from('device_tokens')
    .select('token')
    .in('user_id', targetUserIds)
    .eq(optInColumn, true);
  if (error) return new Response('DB error: ' + error.message, { status: 500 });
  if (!tokens || tokens.length === 0) return new Response(JSON.stringify({ sent: 0, reason: 'no tokens' }), { status: 200 });

  const accessToken = await getAccessToken(sa);
  let sent = 0;
  const dead: string[] = [];
  for (const { token } of tokens) {
    const r = await sendOne(accessToken, projectId, token, title, body, data);
    if (r === 'ok') sent++;
    else if (r === 'invalid') dead.push(token);
  }
  // Purge des tokens morts.
  if (dead.length) await supabase.from('device_tokens').delete().in('token', dead);

  return new Response(JSON.stringify({ sent, purged: dead.length, total: tokens.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
