/**
 * Helpers admin — vérifie que l'utilisateur a le role='admin' dans profiles.
 * À utiliser dans les pages /admin/*.
 */
import { getSessionUser, type SessionUser } from './auth';
import { getSupabase } from './supabase';

export async function requireAdmin(redirectTo = '/compte/connexion/'): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    const back = encodeURIComponent(window.location.pathname);
    window.location.href = `${redirectTo}?next=${back}`;
    return new Promise(() => {}) as any;
  }
  if (user.profile?.role !== 'admin') {
    document.body.innerHTML = `
      <div style="max-width: 480px; margin: 80px auto; padding: 40px 24px; text-align: center; font-family: 'Jost', sans-serif;">
        <h1 style="font-size: 1.4rem; margin-bottom: 12px;">Accès refusé</h1>
        <p style="color: #6B7280; margin-bottom: 24px;">Cette section est réservée à l'administration Bovo.</p>
        <a href="/" style="color: #4470B3; font-weight: 600;">← Retour à l'accueil</a>
      </div>
    `;
    return new Promise(() => {}) as any;
  }
  return user;
}

// Labels partagés pour les services
export const SERVICE_LABELS: Record<string, string> = {
  menage: 'Ménage',
  airbnb: 'Airbnb',
  demenagement: 'Déménagement',
  chef: 'Chef',
  plombier: 'Plombier',
};

export const SERVICE_ICONS: Record<string, string> = {
  menage: '🧹',
  airbnb: '🏠',
  demenagement: '🚚',
  chef: '👨‍🍳',
  plombier: '🔧',
};

export const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente',
  confirmed: 'Confirmée',
  assigned: 'Assignée',
  in_progress: 'En cours',
  done: 'Terminée',
  cancelled: 'Annulée',
};

export const STATUS_COLORS: Record<string, string> = {
  pending: '#F59E0B',     // warning
  confirmed: '#10B981',   // success
  assigned: '#4470B3',    // bleu
  in_progress: '#345a8f', // bleu dark
  done: '#6B7280',        // muted
  cancelled: '#DC2626',   // danger
};

/**
 * Échappe les caractères HTML dangereux avant injection via innerHTML.
 * À appliquer sur TOUTE donnée d'origine client/DB (guest_*, payload, full_name…)
 * rendue dans un template HTML — les réservations invité étant insérables par
 * n'importe qui, le back-office est sinon vulnérable au XSS stocké.
 */
export function escapeHtml(s: string | null | undefined): string {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]!));
}

/**
 * Un worker est assignable/disponible sauf s'il est suspendu ou archivé
 * (statut `worker_profiles.status`, carte W3). Absent / null / 'active' → actif.
 */
export function isWorkerActive(status: string | null | undefined): boolean {
  return status !== 'suspended' && status !== 'archived';
}

// ============================================
// Création de worker (carte W1)
// ============================================
export interface CreateWorkerInput {
  full_name: string;
  phone: string;
  email?: string;
  skills: string[];
  zones: string[];
}

export interface CreateWorkerResult {
  ok: true;
  worker_id: string;
  full_name: string;
  has_login: boolean;
  login_email: string | null;
  temp_password: string | null;
}

/**
 * Crée un worker de A à Z via l'Edge Function `admin-create-worker`.
 * Le JWT de l'admin connecté est attaché automatiquement par `functions.invoke` ;
 * la fonction serveur revérifie le rôle admin et utilise la service_role pour
 * créer le compte auth (impossible côté front avec la clé anon).
 *
 * Lève une Error portant le message renvoyé par la fonction en cas d'échec.
 */
export async function createWorker(input: CreateWorkerInput): Promise<CreateWorkerResult> {
  const supa = getSupabase();
  if (!supa) throw new Error('Supabase non configuré');

  const { data, error } = await supa.functions.invoke('admin-create-worker', { body: input });
  if (error) {
    // functions.invoke encapsule les réponses non-2xx dans une FunctionsHttpError
    // dont `context` est la Response : on en extrait le message métier { error }.
    let message = error.message;
    try {
      const ctx = (error as any).context;
      if (ctx && typeof ctx.json === 'function') {
        const body = await ctx.json();
        if (body?.error) message = body.error;
      }
    } catch { /* on garde le message générique */ }
    throw new Error(message);
  }
  return data as CreateWorkerResult;
}
