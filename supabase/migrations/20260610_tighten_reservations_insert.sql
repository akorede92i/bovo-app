-- ============================================
-- MIGRATION 2026-06-10 — Durcissement RLS INSERT reservations
-- ============================================
-- À exécuter dans le SQL editor Supabase sur la base déjà déployée.
-- Idempotent : peut être rejouée sans casser quoi que ce soit.
--
-- Contexte : l'ancienne policy "users insert reservations" était
--   FOR INSERT WITH CHECK (true)
-- ce qui laissait n'importe quel visiteur (y compris anonyme) insérer une
-- réservation avec des valeurs arbitraires — notamment deposit_status='paid'
-- (forge d'acompte payé), un user_id usurpé, un worker auto-assigné, ou un
-- faux identifiant de transaction Kkiapay.
--
-- Cette migration restreint les colonnes sensibles à l'INSERT côté client :
--   * user_id : null (résa invité) OU l'utilisateur authentifié lui-même
--   * status : forcé à 'pending' (pas de 'confirmed'/'done' auto-décerné)
--   * deposit_status : 'none' ou 'pending' uniquement — JAMAIS 'paid'
--   * assigned_worker_id : null (l'assignation reste un acte admin)
--   * deposit_kkiapay_tx : null (le tx ne peut pas être attesté par le client)
--
-- Le passage à deposit_status='paid' + l'enregistrement du tx Kkiapay devront
-- se faire côté serveur (Edge Function en service_role vérifiant la transaction
-- via l'API Kkiapay) — cf. constats B1/B2 de l'audit. Le service_role bypasse
-- la RLS, donc cette policy ne le gêne pas.

drop policy if exists "users insert reservations" on public.reservations;
create policy "users insert reservations" on public.reservations for insert
  with check (
    (user_id is null or user_id = auth.uid())
    and status = 'pending'
    and deposit_status in ('none', 'pending')
    and assigned_worker_id is null
    and deposit_kkiapay_tx is null
  );
