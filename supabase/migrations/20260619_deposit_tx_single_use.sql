-- ============================================
-- MIGRATION 2026-06-19 — Acompte : usage unique du transactionId Kkiapay (atomique)
-- ============================================
-- À exécuter dans le SQL editor Supabase. Idempotent.
--
-- Revue de l'Edge Function confirm-deposit : le contrôle « ce transactionId n'est pas
-- déjà utilisé ailleurs » était un SELECT puis un UPDATE (TOCTOU) — deux requêtes
-- concurrentes pouvaient valider le MÊME paiement sur deux réservations différentes.
-- On rend l'usage unique ATOMIQUE via un index unique partiel : un même tx ne peut
-- être rattaché qu'à UNE seule réservation. La 2e tentative échoue (23505) et la
-- fonction renvoie alors un 409 propre.
--
-- Partiel (where … is not null) : les réservations sans acompte payé gardent
-- deposit_kkiapay_tx = null sans collision.
create unique index if not exists reservations_deposit_tx_unique
  on public.reservations (deposit_kkiapay_tx)
  where deposit_kkiapay_tx is not null;
