-- ============================================
-- MIGRATION 2026-06-19 — Worker autonome sur SES disponibilités (W8)
-- ============================================
-- À exécuter dans le SQL editor Supabase. Idempotent.
--
-- Jusqu'ici worker_availability/worker_blackouts étaient en écriture ADMIN ONLY.
-- On autorise le worker à gérer SES PROPRES créneaux récurrents et congés
-- (auth.uid() = worker_id), pour l'auto-déclaration depuis l'app worker. Les
-- policies admin "admin manages worker availability/blackouts" restent (l'admin
-- garde la main : voir/modifier). Le matching consomme déjà ces tables.

-- Créneaux récurrents : le worker gère les siens.
drop policy if exists "worker manages own availability" on public.worker_availability;
create policy "worker manages own availability" on public.worker_availability
  for all
  using (auth.uid() = worker_id)
  with check (auth.uid() = worker_id);

-- Congés / indisponibilités : le worker gère les siens (la policy SELECT
-- "worker reads own blackouts" existait déjà ; on ajoute insert/update/delete).
drop policy if exists "worker manages own blackouts" on public.worker_blackouts;
create policy "worker manages own blackouts" on public.worker_blackouts
  for all
  using (auth.uid() = worker_id)
  with check (auth.uid() = worker_id);

-- Resserrage LECTURE (revue #28, point #1) : un worker ne lit plus QUE ses propres
-- skills/zones/dispos ; l'admin (matching) lit tout. Avant : is_worker() laissait
-- tout worker énumérer le graphe métier de tous les workers.
drop policy if exists "worker/admin read worker skills" on public.worker_skills;
create policy "own/admin read worker skills" on public.worker_skills
  for select using (auth.uid() = worker_id or public.is_admin());

drop policy if exists "worker/admin read worker zones" on public.worker_zones;
create policy "own/admin read worker zones" on public.worker_zones
  for select using (auth.uid() = worker_id or public.is_admin());

drop policy if exists "worker/admin read worker avail" on public.worker_availability;
create policy "own/admin read worker avail" on public.worker_availability
  for select using (auth.uid() = worker_id or public.is_admin());
