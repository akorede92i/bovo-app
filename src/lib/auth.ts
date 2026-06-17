/**
 * Helpers d'auth client-side pour les pages protégées (/compte/*).
 * Les pages Astro statiques exécutent ce code après hydratation.
 */
import { getSupabase } from './supabase';
import type { Profile } from './supabase';

export interface SessionUser {
  id: string;
  email: string;
  profile: Profile | null;
}

/**
 * Récupère la session courante. Renvoie null si pas connecté.
 * À appeler dans les <script> des pages protégées.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supa = getSupabase();
  if (!supa) return null;

  const { data: { session } } = await supa.auth.getSession();
  if (!session?.user) return null;

  const { data: profile } = await supa
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .maybeSingle();

  return {
    id: session.user.id,
    email: session.user.email ?? '',
    profile: (profile as Profile) ?? null,
  };
}

/**
 * Protège une page : redirige vers /compte/connexion si pas connecté.
 * À appeler en haut des scripts des pages protégées.
 */
export async function requireAuth(redirectTo = '/compte/connexion/'): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    const back = encodeURIComponent(window.location.pathname);
    window.location.href = `${redirectTo}?next=${back}`;
    // promise that never resolves to stop further execution
    return new Promise(() => {}) as any;
  }
  return user;
}

/**
 * Protège l'espace worker (`/worker/*`) : réservé aux comptes `role='worker'`
 * (les admins y ont aussi accès, pour visualiser/tester). Redirige si non connecté,
 * affiche un refus si rôle insuffisant. Cf. requireAdmin pour le pattern.
 */
export async function requireWorker(redirectTo = '/compte/connexion/'): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    const back = encodeURIComponent(window.location.pathname);
    window.location.href = `${redirectTo}?next=${back}`;
    return new Promise(() => {}) as any;
  }
  const role = user.profile?.role;
  if (role !== 'worker' && role !== 'admin') {
    document.body.innerHTML = `
      <div style="max-width: 480px; margin: 80px auto; padding: 40px 24px; text-align: center; font-family: 'Jost', sans-serif;">
        <h1 style="font-size: 1.4rem; margin-bottom: 12px;">Accès réservé</h1>
        <p style="color: #6B7280; margin-bottom: 24px;">Cet espace est réservé aux intervenants Bovo.</p>
        <a href="/" style="color: #4470B3; font-weight: 600;">← Retour à l'accueil</a>
      </div>
    `;
    return new Promise(() => {}) as any;
  }
  return user;
}

export async function signOut(): Promise<void> {
  const supa = getSupabase();
  if (!supa) return;
  await supa.auth.signOut();
  window.location.href = '/';
}
