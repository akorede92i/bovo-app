/**
 * Edge Function Supabase — admin-create-worker
 *
 * Crée un worker de A à Z depuis le back-office admin, SANS pré-inscription
 * de la personne (carte W1). La création d'un compte `auth.users` exige la
 * SERVICE_ROLE_KEY, impossible avec la clé anon côté navigateur — d'où cette
 * fonction serveur.
 *
 * Sécurité :
 *   - L'appelant doit présenter un JWT valide (Authorization: Bearer <access_token>,
 *     ajouté automatiquement par supabase.functions.invoke côté front).
 *   - On vérifie que cet appelant a bien `profiles.role = 'admin'` AVANT toute
 *     écriture. Le guard front (requireAdmin) n'est qu'un confort ; la vraie
 *     barrière est ici.
 *
 * Corps attendu (POST JSON) :
 *   { full_name: string, phone: string, email?: string,
 *     skills?: string[], zones?: string[] }
 *
 * Réponse 200 :
 *   { ok: true, worker_id, full_name, has_login, login_email, temp_password }
 *   temp_password n'est renseigné que si un email réel a été fourni (sinon le
 *   compte est « géré » par l'admin, sans login utile tant que W7 n'existe pas).
 *
 * Déploiement (manuel, comme les migrations) :
 *   supabase functions deploy admin-create-worker
 *   (NE PAS passer --no-verify-jwt : on veut la vérif de jeton de la plateforme
 *    en plus de notre propre contrôle admin.)
 *   Secrets requis (fournis automatiquement par la plateforme) :
 *     SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 */
// @ts-ignore - deno runtime
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
// @ts-ignore - esm
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// @ts-ignore - Deno global
const env = (key: string): string | undefined =>
  (typeof Deno !== 'undefined' ? Deno.env.get(key) : undefined);

const ALLOWED_SKILLS = ['menage', 'airbnb', 'demenagement', 'chef', 'plombier'];

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

/** Mot de passe temporaire robuste (alphanum + symbole), sans dépendance externe. */
function genPassword(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const core = Array.from(bytes, (b) => b.toString(36)).join('').slice(0, 16);
  return `Bv${core}9!`;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405);

  const SUPABASE_URL = env('SUPABASE_URL');
  const ANON_KEY = env('SUPABASE_ANON_KEY');
  const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
    console.error('Edge function mal configurée : variables SUPABASE_* manquantes');
    return json({ error: 'Serveur mal configuré' }, 500);
  }

  // 1) Authentification : on lit le JWT de l'appelant.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ error: 'Non authentifié' }, 401);

  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user: caller }, error: callerErr } = await callerClient.auth.getUser();
  if (callerErr || !caller) return json({ error: 'Session invalide ou expirée' }, 401);

  // 2) Autorisation : l'appelant DOIT être admin.
  const { data: callerProfile } = await callerClient
    .from('profiles').select('role').eq('id', caller.id).maybeSingle();
  if (callerProfile?.role !== 'admin') {
    return json({ error: 'Accès réservé à l’administration Bovo' }, 403);
  }

  // 3) Parsing + validation du corps.
  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'JSON invalide' }, 400); }

  const full_name = String(body?.full_name ?? '').trim();
  const phone = String(body?.phone ?? '').trim();
  const email = String(body?.email ?? '').trim().toLowerCase();
  const skills: string[] = Array.isArray(body?.skills)
    ? [...new Set(body.skills.map(String))].filter((s) => ALLOWED_SKILLS.includes(s))
    : [];
  const zones: string[] = Array.isArray(body?.zones)
    ? [...new Set(body.zones.map((z: unknown) => String(z).trim()).filter(Boolean))]
    : [];

  if (!full_name) return json({ error: 'Le nom complet est requis' }, 400);
  if (!phone) return json({ error: 'Le téléphone est requis' }, 400);
  const phoneDigits = phone.replace(/\D/g, '');
  if (phoneDigits.length < 8) return json({ error: 'Numéro de téléphone invalide' }, 400);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: 'Adresse email invalide' }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 4) Garde-fou anti-doublon : un worker/admin avec ce téléphone existe-t-il déjà ?
  const { data: dupe } = await admin
    .from('profiles').select('id, full_name')
    .eq('phone', phone).in('role', ['worker', 'admin']).maybeSingle();
  if (dupe) {
    return json({ error: `Un worker existe déjà avec ce téléphone (${dupe.full_name ?? dupe.id}).` }, 409);
  }

  // 5) Création du compte auth.
  //    Sans email réel : on fabrique un identifiant interne à partir du téléphone
  //    (compte « géré », sans login utile tant que l'app worker — W7 — n'existe pas).
  const hasEmail = !!email;
  const loginEmail = hasEmail ? email : `worker.${phoneDigits}@worker.bovo.local`;
  const tempPassword = genPassword();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: loginEmail,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name, phone },
  });
  if (createErr || !created?.user) {
    const msg = createErr?.message ?? 'Échec de la création du compte';
    const conflict = /already|exist|registered|duplicate/i.test(msg);
    return json(
      { error: conflict ? `Cet email est déjà utilisé : ${msg}` : msg },
      conflict ? 409 : 400,
    );
  }
  const workerId = created.user.id;

  // 6) Le trigger handle_new_user a créé le profil en role 'customer' à partir des
  //    user_metadata. On le passe en 'worker' (upsert de secours si le trigger
  //    était absent sur l'environnement).
  const { error: profErr } = await admin
    .from('profiles').update({ role: 'worker', full_name, phone }).eq('id', workerId);
  if (profErr) {
    await admin.from('profiles').upsert({ id: workerId, role: 'worker', full_name, phone });
  }

  // 7) Skills + zones choisis (assignables aussitôt par le matching).
  if (skills.length) {
    const { error } = await admin.from('worker_skills')
      .insert(skills.map((skill) => ({ worker_id: workerId, skill })));
    if (error) console.error('worker_skills insert:', error.message);
  }
  if (zones.length) {
    const { error } = await admin.from('worker_zones')
      .insert(zones.map((zone) => ({ worker_id: workerId, zone })));
    if (error) console.error('worker_zones insert:', error.message);
  }

  return json({
    ok: true,
    worker_id: workerId,
    full_name,
    has_login: hasEmail,
    login_email: hasEmail ? loginEmail : null,
    temp_password: hasEmail ? tempPassword : null,
  });
});
