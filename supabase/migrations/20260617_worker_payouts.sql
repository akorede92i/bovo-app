-- ============================================
-- MIGRATION 2026-06-17 — Paie worker (worker_payouts) — carte W6
-- ============================================
-- À exécuter dans le SQL editor Supabase (preprod d'abord si elle existe). Idempotent.
--
-- `worker_payouts` = JOURNAL des paiements EFFECTUÉS : une ligne par mission `done`
-- marquée payée par l'admin. La présence d'une ligne = mission payée ; son absence
-- = à payer. Le montant est figé (snapshot) au moment du marquage « payé ».
-- ⚠️ Aucun virement automatique : l'admin marque « payé » à la main.
-- Le « dû » non payé est calculé À LA VOLÉE côté page paie (à partir du tarif W2),
-- ce qui laisse le tarif s'ajuster tant que la mission n'est pas payée.

create table if not exists public.worker_payouts (
  id uuid primary key default uuid_generate_v4(),
  reservation_id uuid not null unique references public.reservations(id) on delete cascade,
  worker_id uuid not null references auth.users(id) on delete cascade,
  amount_xof integer not null check (amount_xof >= 0),
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists worker_payouts_worker_idx on public.worker_payouts(worker_id);

alter table public.worker_payouts enable row level security;

drop policy if exists "admin manages worker payouts" on public.worker_payouts;
create policy "admin manages worker payouts" on public.worker_payouts
  for all using (public.is_admin()) with check (public.is_admin());
