-- ============================================
-- MIGRATION 2026-06-17 — App worker v2 : accepter / refuser une mission (W7 v2)
-- ============================================
-- À exécuter dans le SQL editor Supabase (preprod d'abord si elle existe). Idempotent.
-- ADDITIVE et à faible risque : on ajoute 3 colonnes de suivi de la réponse worker.
-- AUCUNE modification du trigger de protection paiement.
--
-- Pourquoi pas de changement de trigger : la branche worker de
-- `lock_reservation_sensitive_fields` (W7 v1) restaure une liste FIXE de colonnes
-- sensibles ; ces 3 nouvelles colonnes n'y figurent pas → un worker assigné peut
-- déjà les positionner sur SA mission (et rien d'autre). L'admin (branche full)
-- les remet à null lors d'une réassignation.

alter table public.reservations
  add column if not exists worker_accepted_at  timestamptz,
  add column if not exists worker_declined_at  timestamptz,
  add column if not exists worker_decline_reason text;
