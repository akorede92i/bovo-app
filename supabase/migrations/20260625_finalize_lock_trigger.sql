-- ============================================
-- MIGRATION 2026-06-25 — Finalise lock_reservation_sensitive_fields (audit 7 jours)
-- ============================================
-- À exécuter dans le SQL editor Supabase. Idempotent. No-op sur la prod (déjà à jour).
--
-- PROBLÈME : deux migrations 20260617 redéfinissent ce trigger. Par ordre de NOM de
-- fichier, `20260617_worker_reservation_updates.sql` (W7 v1, inférieure) s'applique
-- APRÈS `20260617_lock_trigger_worker_cols.sql` (W7 v2, la bonne) — donc sur un REJEU
-- à neuf (preprod, DR, fork) la v1 gagne et NE verrouille PAS worker_accepted_at /
-- worker_declined_at / worker_decline_reason côté client (un client pourrait fausser
-- l'état d'accept/refus worker, ou annuler ses missions). Aucun impact paiement
-- (deposit_status/tx/assigned_worker_id verrouillés dans les deux versions).
--
-- Cette migration, datée APRÈS toutes les autres, réapplique la version FINALE pour
-- qu'elle gagne quel que soit l'ordre de rejeu. Durcit aussi handle_new_user.

create or replace function public.lock_reservation_sensitive_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Admin et service_role : tous les droits.
  if public.is_admin() or auth.role() = 'service_role' then
    return new;
  end if;

  -- Worker ASSIGNÉ : avance le statut de SA mission (assigned→in_progress→done) et
  -- pose sa réponse ; tout le reste restauré depuis OLD.
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
    if not (
      (old.status = 'assigned'    and new.status = 'in_progress') or
      (old.status = 'in_progress' and new.status = 'done')
    ) then
      new.status := old.status;
    end if;
    return new;
  end if;

  -- Client propriétaire / autre non-admin : ne peut qu'annuler ; colonnes de réponse
  -- worker VERROUILLÉES (restaurées depuis OLD).
  new.user_id               := old.user_id;
  new.service_type          := old.service_type;
  new.estimated_total_xof   := old.estimated_total_xof;
  new.deposit_status        := old.deposit_status;
  new.deposit_kkiapay_tx    := old.deposit_kkiapay_tx;
  new.assigned_worker_id    := old.assigned_worker_id;
  new.worker_accepted_at    := old.worker_accepted_at;
  new.worker_declined_at    := old.worker_declined_at;
  new.worker_decline_reason := old.worker_decline_reason;
  if new.status is distinct from old.status and new.status <> 'cancelled' then
    new.status := old.status;
  end if;
  return new;
end;
$$;

-- Durcissement search_path (défense en profondeur ; refs déjà qualifiées).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'phone');
  return new;
end;
$$;
