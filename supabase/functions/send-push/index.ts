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
import { coerceData, classifyFcmFailure, isServiceRoleAuthorized, messageForStatus, SERVICE_LABELS } from './lib.ts';

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

  // Envoie un message à un ensemble d'utilisateurs (en respectant l'opt-in du canal).
  // Purge les tokens réellement morts. Centralise la logique d'envoi pour pouvoir
  // notifier plusieurs cibles dans une même requête (ex. client + worker).
  async function notify(
    userIds: string[],
    title: string,
    body: string,
    data: Record<string, string>,
    channel: 'transactional' | 'marketing',
  ): Promise<{ sent: number; purged: number; total: number }> {
    const ids = [...new Set(userIds.filter(Boolean))];
    if (ids.length === 0) return { sent: 0, purged: 0, total: 0 };
    const optInColumn = channel === 'marketing' ? 'allow_marketing' : 'allow_transactional';
    const { data: tokens } = await supabase.from('device_tokens').select('token').in('user_id', ids).eq(optInColumn, true);
    if (!tokens || tokens.length === 0) return { sent: 0, purged: 0, total: 0 };
    const accessToken = await getAccessToken(sa);
    let sent = 0;
    const dead: string[] = [];
    for (const { token } of tokens) {
      const r = await sendOne(accessToken, projectId, token, title, body, data);
      if (r === 'ok') sent++;
      else if (r === 'invalid') dead.push(token);
    }
    if (dead.length) await supabase.from('device_tokens').delete().in('token', dead);
    return { sent, purged: dead.length, total: tokens.length };
  }

  // ---- Mode 1 : webhook DB (UPDATE reservations) ----
  if (payload.type === 'UPDATE' && payload.table === 'reservations') {
    const rec = payload.record;
    const old = payload.old_record;
    const result: Record<string, unknown> = {};

    // (a) Suivi CLIENT sur changement de statut (réservation d'un compte).
    if (rec?.user_id && rec.status !== old?.status) {
      const msg = messageForStatus(rec.status, rec.service_type);
      if (msg) {
        result.client = await notify(
          [rec.user_id], msg.title, msg.body,
          coerceData({ type: 'reservation', reservationId: rec.id, status: rec.status, url: '/compte/reservations/' }),
          'transactional',
        );
      }
    }

    // (b) WORKER sur nouvelle affectation (W7 v2) : assigned_worker_id vient de changer.
    if (rec?.assigned_worker_id && rec.assigned_worker_id !== old?.assigned_worker_id) {
      const svc = SERVICE_LABELS[rec.service_type] ?? 'mission';
      result.worker = await notify(
        [rec.assigned_worker_id], 'Nouvelle mission 🛠️',
        `Une ${svc} vous a été assignée. Ouvrez l'app pour les détails.`,
        coerceData({ type: 'assignment', reservationId: rec.id, url: `/worker/?mission=${rec.id}` }),
        'transactional',
      );
    }

    return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  // ---- Mode 2 : appel direct (rappels / promos) ----
  if (payload.title && payload.body) {
    const channel: 'transactional' | 'marketing' = payload.channel === 'marketing' ? 'marketing' : 'transactional';
    let ids: string[] = [];
    if (payload.userId) ids = [String(payload.userId)];
    else if (Array.isArray(payload.userIds)) ids = payload.userIds.map(String);
    else return new Response('userId or userIds required', { status: 400 });
    const res = await notify(ids, String(payload.title), String(payload.body), coerceData(payload.data), channel);
    return new Response(JSON.stringify(res), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  return new Response('Unrecognized payload', { status: 400 });
});
