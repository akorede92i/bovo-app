/**
 * Enregistrement des jetons de push dans Supabase (`device_tokens`).
 *
 * Le jeton FCM (capté par `@capacitor-firebase/messaging` côté natif) est lié au
 * profil de l'utilisateur connecté. S'il n'est pas connecté, on mémorise le jeton
 * et on le rattache au prochain login via `flushPendingDeviceToken()`.
 */
import { getSupabase } from '@lib/supabase';

export type PushPlatform = 'android' | 'ios' | 'web';

const PENDING_KEY = 'bovo_pending_push_token';

export async function saveDeviceToken(token: string, platform: PushPlatform): Promise<void> {
  if (!token) return;
  const supabase = getSupabase();
  if (!supabase) return;

  const { data } = await supabase.auth.getUser();
  const user = data?.user;
  if (!user) {
    // Pas encore connecté : on garde le jeton pour le rattacher après login.
    try {
      localStorage.setItem(PENDING_KEY, JSON.stringify({ token, platform }));
    } catch {
      /* ignore */
    }
    return;
  }

  await supabase.from('device_tokens').upsert(
    {
      user_id: user.id,
      token,
      platform,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'token' },
  );

  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

/** À appeler juste après un login réussi pour rattacher un jeton capté avant connexion. */
export async function flushPendingDeviceToken(): Promise<void> {
  let pending: { token: string; platform: PushPlatform } | null = null;
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (raw) pending = JSON.parse(raw);
  } catch {
    /* ignore */
  }
  if (pending?.token) await saveDeviceToken(pending.token, pending.platform);
}
