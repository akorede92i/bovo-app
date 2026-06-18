-- ============================================
-- MIGRATION 2026-06-19 — Worker suspendu/archivé : ne voit plus ni n'agit sur ses missions
-- ============================================
-- À exécuter dans le SQL editor Supabase. Idempotent.
--
-- Audit cohérence worker↔admin : la suspension/archivage (worker_profiles.status)
-- n'était appliquée QUE côté UI (matching / modales d'affectation). En base, la vue
-- worker_missions et la policy UPDATE worker s'appuyaient sur is_worker() (rôle seul),
-- donc un worker passé 'suspended'/'archived' gardait l'accès à ses missions DÉJÀ
-- affectées : il les voyait via la vue et pouvait accept/refuse + avancer le statut.
-- On ajoute un contrôle RH EN BASE (couvre aussi tout accès direct hors UI).

-- Helper : worker (ou admin) NON suspendu/archivé.
create or replace function public.is_active_worker()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.is_worker()
     and not exists (
       select 1 from public.worker_profiles wp
       where wp.worker_id = auth.uid()
         and wp.status in ('suspended', 'archived')
     );
$$;

-- Vue worker_missions : restreinte aux workers ACTIFS (+ rappel du verrou lecture-seule,
-- cf. 20260619_worker_data_least_privilege / _worker_missions_grants_lockdown).
create or replace view public.worker_missions
with (security_invoker = false) as
  select id, service_type, guest_name, guest_phone, scheduled_at, duration_min,
         status, payload, worker_accepted_at, worker_declined_at, worker_decline_reason
  from public.reservations
  where assigned_worker_id = auth.uid() and public.is_active_worker();
revoke all on public.worker_missions from anon, authenticated, public;
grant select on public.worker_missions to authenticated;

-- Policy UPDATE worker : un worker suspendu/archivé ne peut plus accepter/refuser/avancer.
drop policy if exists "workers advance own assigned reservations" on public.reservations;
create policy "workers advance own assigned reservations" on public.reservations
  for update
  using (public.is_active_worker() and assigned_worker_id = auth.uid())
  with check (public.is_active_worker() and assigned_worker_id = auth.uid());
