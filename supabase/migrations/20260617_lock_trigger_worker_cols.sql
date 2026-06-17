-- ============================================
-- MIGRATION 2026-06-17 — Durcissement : un client ne peut pas écrire les colonnes
-- de réponse worker (W7 v2 hardening)
-- ============================================
-- À exécuter dans le SQL editor Supabase. Idempotent (create or replace).
--
-- Suite à la revue W7 v2 : un CLIENT propriétaire (ou un worker via API hors UI)
-- pouvait écrire worker_accepted_at/declined_at/decline_reason sur SA réservation
-- → fausser l'affichage d'état worker côté admin (nuisance, aucun impact paiement,
-- motif échappé à l'affichage). On ferme la nuisance côté CLIENT : la branche
-- « client » du trigger restaure désormais ces 3 colonnes depuis OLD.
--
-- La branche WORKER continue de les laisser libres : c'est exactement la feature
-- accepter/refuser (un worker assigné pose sa réponse sur SA mission). L'admin
-- (branche full) garde tous les droits et les remet à null à la réassignation.

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

  -- Worker ASSIGNÉ : avance le statut de SA mission (assigned→in_progress→done)
  -- et peut poser sa réponse (worker_accepted_at/declined_at/decline_reason) ;
  -- tout le reste restauré depuis OLD.
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

  -- Client propriétaire / autre non-admin : ne peut qu'annuler. Les colonnes de
  -- réponse worker sont désormais VERROUILLÉES (restaurées depuis OLD).
  new.user_id              := old.user_id;
  new.service_type         := old.service_type;
  new.estimated_total_xof  := old.estimated_total_xof;
  new.deposit_status       := old.deposit_status;
  new.deposit_kkiapay_tx   := old.deposit_kkiapay_tx;
  new.assigned_worker_id   := old.assigned_worker_id;
  new.worker_accepted_at   := old.worker_accepted_at;
  new.worker_declined_at   := old.worker_declined_at;
  new.worker_decline_reason := old.worker_decline_reason;
  if new.status is distinct from old.status and new.status <> 'cancelled' then
    new.status := old.status;
  end if;
  return new;
end;
$$;
