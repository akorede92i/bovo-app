-- ============================================
-- MIGRATION 2026-06-17 — App worker : un worker fait avancer SES missions (W7)
-- ============================================
-- À exécuter dans le SQL editor Supabase (preprod d'abord si elle existe). Idempotent.
--
-- Un worker (role 'worker') doit pouvoir faire AVANCER le statut de SES missions
-- (assigned → in_progress → done) — et RIEN d'autre : ni toucher aux missions des
-- autres, ni modifier montant/dépôt/affectation/adresse/client, ni revenir en arrière.
-- (1) une policy UPDATE ciblée + (2) une branche dans le trigger de verrouillage.

-- 1) Un worker peut UPDATE les réservations qui lui sont assignées (le trigger
--    ci-dessous restreint CE qu'il peut réellement changer).
drop policy if exists "workers advance own assigned reservations" on public.reservations;
create policy "workers advance own assigned reservations" on public.reservations
  for update to authenticated
  using (public.is_worker() and assigned_worker_id = auth.uid())
  with check (public.is_worker() and assigned_worker_id = auth.uid());

-- 2) Verrou des champs sensibles, étendu au cas du worker assigné.
create or replace function public.lock_reservation_sensitive_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Admin et service_role (vérif paiement serveur) : tous les droits.
  if public.is_admin() or auth.role() = 'service_role' then
    return new;
  end if;

  -- Worker ASSIGNÉ à cette réservation : il ne peut faire AVANCER que le statut
  -- de SA mission ; tout le reste est restauré depuis l'ancien enregistrement.
  if public.is_worker()
     and old.assigned_worker_id is not null
     and old.assigned_worker_id = auth.uid() then
    new.user_id             := old.user_id;
    new.guest_name          := old.guest_name;
    new.guest_phone         := old.guest_phone;
    new.guest_email         := old.guest_email;
    new.service_type        := old.service_type;
    new.payload             := old.payload;
    new.address_id          := old.address_id;
    new.scheduled_at        := old.scheduled_at;
    new.duration_min        := old.duration_min;
    new.estimated_total_xof := old.estimated_total_xof;
    new.deposit_status      := old.deposit_status;
    new.deposit_kkiapay_tx  := old.deposit_kkiapay_tx;
    new.assigned_worker_id  := old.assigned_worker_id;
    -- Seules transitions autorisées : assigned→in_progress, in_progress→done.
    if not (
      (old.status = 'assigned'    and new.status = 'in_progress') or
      (old.status = 'in_progress' and new.status = 'done')
    ) then
      new.status := old.status;
    end if;
    return new;
  end if;

  -- Autre non-admin (client propriétaire) : verrou existant — ne peut qu'annuler.
  new.user_id             := old.user_id;
  new.service_type        := old.service_type;
  new.estimated_total_xof := old.estimated_total_xof;
  new.deposit_status      := old.deposit_status;
  new.deposit_kkiapay_tx  := old.deposit_kkiapay_tx;
  new.assigned_worker_id  := old.assigned_worker_id;
  if new.status is distinct from old.status and new.status <> 'cancelled' then
    new.status := old.status;
  end if;
  return new;
end;
$$;
