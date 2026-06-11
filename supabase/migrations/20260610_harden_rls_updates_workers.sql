-- ============================================
-- MIGRATION 2026-06-10 — Durcissement RLS : UPDATE reservations + tables worker
-- ============================================
-- À exécuter dans le SQL editor Supabase. Idempotent.
--
-- E3 : la policy UPDATE de reservations n'avait pas de WITH CHECK — un client
-- propriétaire pouvait modifier TOUS les champs de sa résa (status='done',
-- deposit_status='paid', réassignation de worker/user_id, montant…). On verrouille
-- ces colonnes via un trigger BEFORE UPDATE : un non-admin ne peut qu'annuler.
--
-- Worker tables : elles étaient lisibles par les visiteurs anonymes (using(true)),
-- exposant compétences/zones/plannings. On les restreint aux utilisateurs connectés
-- (le matching tourne côté admin).

-- 1) Verrou des champs sensibles sur UPDATE reservations
create or replace function public.lock_reservation_sensitive_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Admin et service_role (vérif paiement serveur) gardent tous les droits.
  if public.is_admin() or auth.role() = 'service_role' then
    return new;
  end if;
  -- Un non-admin ne peut pas toucher aux colonnes sensibles : on restaure l'ancien.
  new.user_id             := old.user_id;
  new.service_type        := old.service_type;
  new.estimated_total_xof := old.estimated_total_xof;
  new.deposit_status      := old.deposit_status;
  new.deposit_kkiapay_tx  := old.deposit_kkiapay_tx;
  new.assigned_worker_id  := old.assigned_worker_id;
  -- Seule transition de statut autorisée côté client : l'annulation.
  if new.status is distinct from old.status and new.status <> 'cancelled' then
    new.status := old.status;
  end if;
  return new;
end;
$$;

drop trigger if exists reservations_lock_sensitive on public.reservations;
create trigger reservations_lock_sensitive
  before update on public.reservations
  for each row execute function public.lock_reservation_sensitive_fields();

-- 2) Tables worker : lecture réservée aux utilisateurs connectés (plus d'accès anonyme)
drop policy if exists "anyone can read worker skills/zones/avail" on public.worker_skills;
drop policy if exists "auth reads worker skills" on public.worker_skills;
create policy "auth reads worker skills" on public.worker_skills for select using (auth.uid() is not null);

drop policy if exists "anyone can read worker zones" on public.worker_zones;
drop policy if exists "auth reads worker zones" on public.worker_zones;
create policy "auth reads worker zones" on public.worker_zones for select using (auth.uid() is not null);

drop policy if exists "anyone can read worker avail" on public.worker_availability;
drop policy if exists "auth reads worker avail" on public.worker_availability;
create policy "auth reads worker avail" on public.worker_availability for select using (auth.uid() is not null);
