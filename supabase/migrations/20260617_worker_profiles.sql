-- ============================================
-- MIGRATION 2026-06-17 — Fiche worker enrichie (RH) — carte W2
-- ============================================
-- À exécuter dans le SQL editor Supabase (preprod d'abord, puis prod). Idempotent.
--
-- Transforme la fiche worker minimale (nom + tél, dans profiles) en vraie fiche RH.
-- Table 1:1 avec le worker (worker_id = profiles.id = auth.users.id).
--
-- Confidentialité : ces données (tarif, note interne, contact d'urgence, pièce
-- d'identité) sont SENSIBLES. RLS = admin uniquement. La lecture/écriture par le
-- worker de son propre sous-ensemble est volontairement repoussée à W7 (app worker),
-- car `internal_note` ne doit jamais être visible du worker et la RLS est par ligne,
-- pas par colonne — on ouvrira un accès worker via une vue dédiée le moment venu.
--
-- `status` est créé ici (défaut 'active') : c'est la colonne dont dépend W3
-- (exclusion des workers suspendus/archivés du matching).

create table if not exists public.worker_profiles (
  worker_id uuid primary key references auth.users(id) on delete cascade,
  hire_date date,
  contract_type text check (contract_type in ('freelance', 'salarie', 'essai')),
  status text not null default 'active' check (status in ('active', 'suspended', 'archived')),
  pay_type text check (pay_type in ('horaire', 'mission')),
  rate_xof integer check (rate_xof is null or rate_xof >= 0),
  emergency_contact text,
  internal_note text,
  id_doc_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tient updated_at à jour automatiquement.
create or replace function public.worker_profiles_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists worker_profiles_set_updated_at on public.worker_profiles;
create trigger worker_profiles_set_updated_at
  before update on public.worker_profiles
  for each row execute function public.worker_profiles_touch_updated_at();

-- RLS : admin uniquement (lecture + écriture). Aucun accès worker/anonyme pour l'instant.
alter table public.worker_profiles enable row level security;

drop policy if exists "admin manages worker profiles" on public.worker_profiles;
create policy "admin manages worker profiles" on public.worker_profiles
  for all using (public.is_admin()) with check (public.is_admin());
