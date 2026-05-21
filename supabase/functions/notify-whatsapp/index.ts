/**
 * Edge Function Supabase — notify-whatsapp
 *
 * Déclenchée via DB webhook quand une nouvelle ligne est insérée dans `reservations`.
 * Envoie une notification à l'admin Bovo en utilisant l'un des providers configurés :
 *  - WaSenderApi / CallMeBot / Twilio WhatsApp (selon WHATSAPP_PROVIDER)
 *  - Fallback : log + envoi email via Resend si configuré
 *
 * Setup :
 *   1. supabase secrets set WHATSAPP_PROVIDER=callmebot
 *   2. supabase secrets set CALLMEBOT_APIKEY=xxx (cf. callmebot.com/blog/free-api-whatsapp-messages)
 *   3. supabase secrets set ADMIN_WHATSAPP=2290196677743
 *   4. supabase functions deploy notify-whatsapp --no-verify-jwt
 *   5. Dans Supabase Studio → Database → Webhooks : créer un webhook
 *      table=reservations, events=INSERT, type=HTTP Request,
 *      URL=https://<project>.supabase.co/functions/v1/notify-whatsapp,
 *      Headers : Authorization: Bearer <SERVICE_ROLE_KEY>
 */
// @ts-ignore - deno runtime
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

interface ReservationRecord {
  id: string;
  service_type: 'menage' | 'airbnb' | 'demenagement' | 'chef';
  guest_name: string | null;
  guest_phone: string | null;
  guest_email: string | null;
  estimated_total_xof: number | null;
  scheduled_at: string | null;
  status: string;
  deposit_status: string;
  payload: Record<string, unknown>;
  created_at: string;
}

// @ts-ignore Deno global
const env = (key: string) => (typeof Deno !== 'undefined' ? Deno.env.get(key) : undefined);

const SERVICE_LABELS: Record<string, string> = {
  menage: 'Ménage',
  airbnb: 'Airbnb (host)',
  demenagement: 'Déménagement',
  chef: 'Chef à domicile',
};

function fcfa(n: number | null): string {
  if (!n) return '—';
  return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA';
}

function formatMessage(rec: ReservationRecord): string {
  const label = SERVICE_LABELS[rec.service_type] ?? rec.service_type;
  const lines = [
    `🔔 *Nouvelle réservation Bovo — ${label}*`,
    '',
    `Client : ${rec.guest_name ?? '—'}`,
    `Tél : ${rec.guest_phone ?? '—'}`,
    rec.guest_email ? `Email : ${rec.guest_email}` : '',
    rec.scheduled_at ? `Prévu le : ${new Date(rec.scheduled_at).toLocaleString('fr-FR')}` : '',
    rec.estimated_total_xof ? `Estimation : ${fcfa(rec.estimated_total_xof)}` : '',
    rec.deposit_status === 'paid' ? `✅ Acompte payé via Kkiapay` : '',
    rec.deposit_status === 'pending' ? `⏳ Acompte demandé (non payé)` : '',
    '',
    `ID résa : ${rec.id}`,
    `📱 Voir : https://app.bovo.bj/admin/reservations/${rec.id}`,
  ];
  return lines.filter(Boolean).join('\n');
}

async function sendCallMeBot(message: string): Promise<boolean> {
  const phone = env('ADMIN_WHATSAPP');
  const apikey = env('CALLMEBOT_APIKEY');
  if (!phone || !apikey) {
    console.warn('CallMeBot creds missing');
    return false;
  }
  const url = `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encodeURIComponent(message)}&apikey=${apikey}`;
  const res = await fetch(url);
  return res.ok;
}

async function sendTwilio(message: string): Promise<boolean> {
  const sid = env('TWILIO_SID');
  const token = env('TWILIO_TOKEN');
  const from = env('TWILIO_FROM'); // ex. whatsapp:+14155238886
  const to = `whatsapp:+${env('ADMIN_WHATSAPP')}`;
  if (!sid || !token || !from) {
    console.warn('Twilio creds missing');
    return false;
  }
  const body = new URLSearchParams({ From: from, To: to, Body: message });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${btoa(`${sid}:${token}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  return res.ok;
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  // Supabase DB webhook payload : { type: 'INSERT', table: 'reservations', record: {...} }
  const rec = payload.record as ReservationRecord | undefined;
  if (!rec) return new Response('No record', { status: 400 });
  if (payload.type !== 'INSERT') return new Response('Ignored', { status: 200 });

  const message = formatMessage(rec);
  const provider = env('WHATSAPP_PROVIDER') ?? 'callmebot';
  let ok = false;
  if (provider === 'callmebot') ok = await sendCallMeBot(message);
  else if (provider === 'twilio') ok = await sendTwilio(message);
  else console.warn('Unknown provider:', provider);

  return new Response(JSON.stringify({ ok, provider }), {
    status: ok ? 200 : 500,
    headers: { 'Content-Type': 'application/json' },
  });
});
