-- ============================================
-- MIGRATION 2026-06-17 — Durcissement du search_path des fonctions
-- ============================================
-- À exécuter dans le SQL editor Supabase (preprod d'abord si elle existe, sinon
-- prod). Idempotent. Faible risque, additif.
--
-- L'advisor Supabase (lint 0011 « function_search_path_mutable ») signale les
-- fonctions dont le search_path n'est pas fixé : risque de search_path hijacking,
-- particulièrement critique pour les fonctions SECURITY DEFINER (is_admin /
-- is_worker pilotent toute la RLS). On fixe `search_path = ''` ; les références
-- restent entièrement qualifiées (public.*, auth.*, et `now()` via pg_catalog
-- toujours implicitement disponible).
--
-- NB : handle_new_user, lock_reservation_sensitive_fields, global_review_stats
-- et worker_review_stats ont déjà `set search_path = public` → non concernés.

-- is_admin : cœur du contrôle d'accès admin (utilisé dans la quasi-totalité des
-- policies RLS).
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- is_worker
create or replace function public.is_worker()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role in ('worker','admin'));
$$;

-- touch_device_tokens_updated_at : trigger de maj d'updated_at (non SECURITY
-- DEFINER, mais flaggé car search_path non fixé).
create or replace function public.touch_device_tokens_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── Volet « surface d'API » (lint 0028/0029) : DÉLIBÉRÉMENT NON TRAITÉ ICI ──
-- Les warnings anon/authenticated_security_definer_function_executable
-- (handle_new_user, lock_reservation_sensitive_fields, is_admin, is_worker,
-- global_review_stats, worker_review_stats) ne sont PAS corrigés dans cette
-- migration :
--   - is_admin / is_worker  → appelés par la RLS, doivent rester exécutables ;
--   - global_review_stats / worker_review_stats → appelés en RPC par le front ;
--   - handle_new_user (trigger d'inscription) / lock_reservation_sensitive_fields :
--     un `revoke execute` est probablement sûr (triggers), mais le comportement
--     PostgreSQL du privilège EXECUTE au déclenchement est assez subtil pour
--     justifier un test en PREPROD avant d'y toucher en prod (risque : casser
--     l'inscription). À reprendre quand la preprod existera.
