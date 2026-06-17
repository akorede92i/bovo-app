/**
 * Helpers Supabase Storage pour les pièces worker (carte W4).
 * Bucket PRIVÉ `worker-docs` — accès admin (RLS). Affichage via URLs signées.
 * Convention : `<worker_id>/avatar` et `<worker_id>/docs/<fichier>`.
 */
import { getSupabase } from './supabase';

export const WORKER_BUCKET = 'worker-docs';
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;   // 5 Mo
export const DOC_MAX_BYTES = 15 * 1024 * 1024;     // 15 Mo

const avatarKey = (workerId: string) => `${workerId}/avatar`;
const docsPrefix = (workerId: string) => `${workerId}/docs`;

/** Téléverse/écrase l'avatar et enregistre son CHEMIN (pas l'URL signée, qui expire)
 *  dans profiles.avatar_url. Renvoie le chemin de l'objet. */
export async function uploadAvatar(workerId: string, file: File): Promise<string> {
  const supa = getSupabase();
  if (!supa) throw new Error('Supabase non configuré');
  if (file.size > AVATAR_MAX_BYTES) throw new Error('Image trop lourde (max 5 Mo).');
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
    throw new Error('La photo doit être une image (hors SVG).');
  }
  const key = avatarKey(workerId);
  const { error } = await supa.storage.from(WORKER_BUCKET)
    .upload(key, file, { upsert: true, contentType: file.type || 'application/octet-stream' });
  if (error) throw new Error(error.message);
  const { error: e2 } = await supa.from('profiles').update({ avatar_url: key }).eq('id', workerId);
  if (e2) throw new Error(e2.message);
  return key;
}

/** Supprime l'avatar (objet + colonne). */
export async function removeAvatar(workerId: string, path: string): Promise<void> {
  const supa = getSupabase();
  if (!supa) throw new Error('Supabase non configuré');
  const { error } = await supa.storage.from(WORKER_BUCKET).remove([path]);
  if (error) throw new Error(error.message);
  const { error: e2 } = await supa.from('profiles').update({ avatar_url: null }).eq('id', workerId);
  if (e2) throw new Error(e2.message);
}

/** URL signée pour UN chemin (null si pas de chemin / erreur). */
export async function signedUrl(path: string | null | undefined, expiresIn = 3600): Promise<string | null> {
  const supa = getSupabase();
  if (!supa || !path) return null;
  const { data } = await supa.storage.from(WORKER_BUCKET).createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
}

/** URLs signées en lot : Map<chemin, url>. Pour les miniatures de la liste. */
export async function signedUrls(paths: string[], expiresIn = 3600): Promise<Map<string, string>> {
  const supa = getSupabase();
  const map = new Map<string, string>();
  const clean = paths.filter(Boolean);
  if (!supa || clean.length === 0) return map;
  const { data } = await supa.storage.from(WORKER_BUCKET).createSignedUrls(clean, expiresIn);
  (data ?? []).forEach((d: any) => { if (d?.path && d?.signedUrl) map.set(d.path, d.signedUrl); });
  return map;
}

export interface WorkerDoc {
  name: string;
  path: string;
  size: number;
  created_at: string | null;
}

/** Liste les documents (hors avatar) d'un worker, plus récents d'abord. */
export async function listDocs(workerId: string): Promise<WorkerDoc[]> {
  const supa = getSupabase();
  if (!supa) return [];
  const { data } = await supa.storage.from(WORKER_BUCKET)
    .list(docsPrefix(workerId), { sortBy: { column: 'created_at', order: 'desc' }, limit: 100 });
  return (data ?? [])
    .filter((f: any) => f?.id) // ignore les pseudo-dossiers (id null)
    .map((f: any) => ({
      name: f.name,
      path: `${docsPrefix(workerId)}/${f.name}`,
      size: f.metadata?.size ?? 0,
      created_at: f.created_at ?? null,
    }));
}

/** Téléverse un document (nom assaini + préfixe horodaté anti-collision). */
export async function uploadDoc(workerId: string, file: File): Promise<void> {
  const supa = getSupabase();
  if (!supa) throw new Error('Supabase non configuré');
  if (file.size > DOC_MAX_BYTES) throw new Error('Fichier trop lourd (max 15 Mo).');
  const okType = (file.type.startsWith('image/') && file.type !== 'image/svg+xml') || file.type === 'application/pdf';
  if (!okType) throw new Error('Format autorisé : image (hors SVG) ou PDF.');
  const safe = (file.name || 'document').replace(/[^\w.\-]+/g, '_').slice(0, 80);
  const key = `${docsPrefix(workerId)}/${Date.now()}-${safe}`;
  const { error } = await supa.storage.from(WORKER_BUCKET)
    .upload(key, file, { upsert: false, contentType: file.type || 'application/octet-stream' });
  if (error) throw new Error(error.message);
}

/** Supprime un document par son chemin. */
export async function deleteDoc(path: string): Promise<void> {
  const supa = getSupabase();
  if (!supa) throw new Error('Supabase non configuré');
  const { error } = await supa.storage.from(WORKER_BUCKET).remove([path]);
  if (error) throw new Error(error.message);
}

/** Formatage taille lisible. */
export function humanSize(bytes: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
