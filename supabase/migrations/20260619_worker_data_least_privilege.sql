-- ============================================
-- MIGRATION 2026-06-19 — Moindre privilège sur les données worker (fuites faibles)
-- ============================================
-- À exécuter dans le SQL editor Supabase. Idempotent.
--
-- Audit sécu : deux fuites en LECTURE (périmètre « ses propres données », pas de
-- cross-tenant, pas de PII d'autrui), corrigées ici.
--
-- 1) worker_skills / worker_zones / worker_availability étaient lisibles par TOUT
--    authentifié (using auth.uid() is not null) → un simple client pouvait énumérer
--    le graphe métier (compétences/zones/créneaux par worker_id). On restreint aux
--    workers et admins. public.is_worker() = role in ('worker','admin'), donc le
--    matching (côté admin) reste fonctionnel.
--
-- 2) Un worker pouvait SELECT TOUTES les colonnes de SES missions sur reservations
--    (guest_email, deposit_kkiapay_tx, estimated_total_xof…), au-delà du nécessaire.
--    On retire la branche worker du SELECT de reservations et on expose les missions
--    via une vue worker_missions limitée aux colonnes utiles, filtrée sur
--    assigned_worker_id = auth.uid(). (L'UPDATE worker — avancer/accepter/refuser —
--    passe par sa propre policy et n'est pas affecté.)

-- 1) Tables worker : lecture réservée aux workers / admins
drop policy if exists "auth reads worker skills" on public.worker_skills;
create policy "worker/admin read worker skills" on public.worker_skills
  for select using (public.is_worker());

drop policy if exists "auth reads worker zones" on public.worker_zones;
create policy "worker/admin read worker zones" on public.worker_zones
  for select using (public.is_worker());

drop policy if exists "auth reads worker avail" on public.worker_availability;
create policy "worker/admin read worker avail" on public.worker_availability
  for select using (public.is_worker());

-- 2a) Vue des missions exposée au worker : colonnes strictement nécessaires.
--     Sémantique DEFINER (security_invoker = false) : la vue contourne la RLS de
--     base MAIS s'auto-restreint à assigned_worker_id = auth.uid(). Aucune colonne
--     sensible (guest_email, estimated_total_xof, deposit_status/tx, user_id).
create or replace view public.worker_missions
with (security_invoker = false) as
  select id, service_type, guest_name, guest_phone, scheduled_at, duration_min,
         status, payload, worker_accepted_at, worker_declined_at, worker_decline_reason
  from public.reservations
  where assigned_worker_id = auth.uid();

revoke all on public.worker_missions from anon;
grant select on public.worker_missions to authenticated;

-- 2b) On retire la branche worker du SELECT de base reservations : un worker lit
--     désormais ses missions via la vue (colonnes safe), plus via la table.
drop policy if exists "users see own reservations" on public.reservations;
create policy "users see own reservations" on public.reservations for select
  using (auth.uid() = user_id or public.is_admin());
