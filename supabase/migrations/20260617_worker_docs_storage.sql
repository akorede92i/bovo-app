-- ============================================
-- MIGRATION 2026-06-17 — Storage worker-docs (photos & documents) — carte W4
-- ============================================
-- À exécuter dans le SQL editor Supabase (preprod d'abord si elle existe). Idempotent.
--
-- Bucket PRIVÉ `worker-docs` : photo de profil (avatar) + pièces (CNI, contrat).
-- Convention de chemin : `<worker_id>/avatar` et `<worker_id>/docs/<fichier>`.
-- Accès :
--   - admin : lecture/écriture/suppression sur tout le bucket ;
--   - worker : lecture de SON propre dossier uniquement (préparé pour W7 — app
--     worker ; sans effet tant qu'aucun worker ne se connecte).
-- L'affichage se fait via des URLs signées (bucket privé), jamais d'URL publique.

-- Bucket privé + enforcement SERVEUR du type MIME et de la taille (pas seulement
-- un hint HTML `accept`) : images (hors SVG, vecteur de XSS) + PDF, ≤ 15 Mo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'worker-docs', 'worker-docs', false, 15728640,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- RLS est déjà activée sur storage.objects par Supabase.
drop policy if exists "admin manages worker-docs" on storage.objects;
create policy "admin manages worker-docs" on storage.objects
  for all to authenticated
  using (bucket_id = 'worker-docs' and public.is_admin())
  with check (bucket_id = 'worker-docs' and public.is_admin());

-- Un worker connecté ne lit que les objets de son propre dossier (1er segment = son uid).
drop policy if exists "worker reads own worker-docs" on storage.objects;
create policy "worker reads own worker-docs" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'worker-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
