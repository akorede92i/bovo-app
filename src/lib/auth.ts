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

export async function signOut(): Promise<void> {
  const supa = getSupabase();
  if (!supa) return;
  await supa.auth.signOut();
  window.location.href = '/';
}
