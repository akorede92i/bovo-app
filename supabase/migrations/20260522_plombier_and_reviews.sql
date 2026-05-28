-- ============================================
-- MIGRATION 2026-05-22 — Plombier + Reviews
-- ============================================
-- À exécuter dans le SQL editor Supabase sur la base déjà déployée.
-- Idempotent : peut être rejouée sans casser quoi que ce soit.

-- 1) Élargir les CHECK constraints pour accepter 'plombier'
alter table public.worker_skills
  drop constraint if exists worker_skills_skill_check;
alter table public.worker_skills
  add constraint worker_skills_skill_check
  check (skill in ('menage', 'airbnb', 'demenagement', 'chef', 'plombier'));

alter table public.reservations
  drop constraint if exists reservations_service_type_check;
alter table public.reservations
  add constraint reservations_service_type_check
  check (service_type in ('menage', 'airbnb', 'demenagement', 'chef', 'plombier'));

-- 2) Table reviews (notes et avis client après prestation)
create table if not exists public.reviews (
  id uuid primary key default uuid_generate_v4(),
  reservation_id uuid not null unique references public.reservations(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  worker_id uuid references auth.users(id) on delete set null,
  service_type text not null check (service_type in ('menage', 'airbnb', 'demenagement', 'chef', 'plombier')),
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);
create index if not exists reviews_worker_idx on public.reviews(worker_id);
create index if not exists reviews_service_idx on public.reviews(service_type);
create index if not exists reviews_customer_idx on public.reviews(customer_id);

alter table public.reviews enable row level security;

drop policy if exists "customer creates review for own done reservation" on public.reviews;
create policy "customer creates review for own done reservation" on public.reviews for insert
  with check (
    auth.uid() = customer_id
    and exists (
      select 1 from public.reservations r
      where r.id = reservation_id
        and r.user_id = auth.uid()
        and r.status = 'done'
    )
  );

drop policy if exists "customer reads own reviews" on public.reviews;
create policy "customer reads own reviews" on public.reviews for select
  using (
    auth.uid() = customer_id
    or public.is_admin()
    or (public.is_worker() and worker_id = auth.uid())
  );

drop policy if exists "admin manages reviews" on public.reviews;
create policy "admin manages reviews" on public.reviews for all using (public.is_admin());

-- 3) Fonctions d'agrégation publiques (la table reviews étant en RLS, on expose juste l'agrégat)
create or replace function public.global_review_stats()
returns table(review_count bigint, avg_rating numeric)
language sql
security definer
stable
set search_path = public
as $$
  select count(*)::bigint, coalesce(round(avg(rating)::numeric, 1), 0)::numeric
  from public.reviews;
$$;
grant execute on function public.global_review_stats() to anon, authenticated;

create or replace function public.worker_review_stats(p_worker_id uuid)
returns table(review_count bigint, avg_rating numeric)
language sql
security definer
stable
set search_path = public
as $$
  select count(*)::bigint, coalesce(round(avg(rating)::numeric, 1), 0)::numeric
  from public.reviews
  where worker_id = p_worker_id;
$$;
grant execute on function public.worker_review_stats(uuid) to authenticated;
