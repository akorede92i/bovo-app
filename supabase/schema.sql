-- ============================================
-- BOVO MOBILE APP — SCHÉMA POSTGRES (Supabase)
-- ============================================
-- Conçu pour supporter dès la v1 le back-office admin de phase 2
-- (workers, disponibilités, assignations, agendas Airbnb).
-- À exécuter dans le SQL editor Supabase.

-- Activer l'extension uuid si pas déjà
create extension if not exists "uuid-ossp";

-- ============================================
-- PROFILES — extension de auth.users
-- ============================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  role text not null default 'customer' check (role in ('customer', 'worker', 'admin')),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create profile à la création d'un user
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'phone');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================
-- ADDRESSES — adresses sauvegardées par client
-- ============================================
create table if not exists public.addresses (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'Domicile',
  zone text not null,
  quartier text,
  street text not null,
  building text,
  lat double precision,
  lng double precision,
  is_default boolean default false,
  created_at timestamptz not null default now()
);
create index if not exists addresses_user_idx on public.addresses(user_id);

-- ============================================
-- WORKER PROFILES — données métier des workers
-- ============================================
create table if not exists public.worker_skills (
  id uuid primary key default uuid_generate_v4(),
  worker_id uuid not null references auth.users(id) on delete cascade,
  skill text not null check (skill in ('menage', 'airbnb', 'demenagement', 'chef', 'plombier')),
  level int default 1 check (level between 1 and 5),
  unique(worker_id, skill)
);

create table if not exists public.worker_zones (
  id uuid primary key default uuid_generate_v4(),
  worker_id uuid not null references auth.users(id) on delete cascade,
  zone text not null,
  unique(worker_id, zone)
);

-- Dispos récurrentes par jour de semaine (0=dimanche, 6=samedi)
create table if not exists public.worker_availability (
  id uuid primary key default uuid_generate_v4(),
  worker_id uuid not null references auth.users(id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6),
  time_start time not null,
  time_end time not null,
  created_at timestamptz not null default now()
);
create index if not exists worker_avail_idx on public.worker_availability(worker_id, day_of_week);

-- Indisponibilités ponctuelles (congés, etc.)
create table if not exists public.worker_blackouts (
  id uuid primary key default uuid_generate_v4(),
  worker_id uuid not null references auth.users(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists worker_blackouts_idx on public.worker_blackouts(worker_id, starts_at);

-- ============================================
-- AIRBNB PROPERTIES — gérées par les hosts
-- ============================================
create table if not exists public.airbnb_properties (
  id uuid primary key default uuid_generate_v4(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  zone text not null,
  quartier text,
  street text not null,
  size_type text not null check (size_type in ('studio', 'f2', 'f3', 'f4', 'villa')),
  ical_url text,
  ical_last_synced_at timestamptz,
  access_instructions text,
  turnover_duration_min int default 120,
  created_at timestamptz not null default now()
);
create index if not exists airbnb_props_owner_idx on public.airbnb_properties(owner_user_id);

-- Turnovers détectés à partir de l'iCal
create table if not exists public.airbnb_turnovers (
  id uuid primary key default uuid_generate_v4(),
  property_id uuid not null references public.airbnb_properties(id) on delete cascade,
  check_out_at timestamptz not null,
  check_in_at timestamptz not null,
  guest_count int,
  status text not null default 'pending' check (status in ('pending', 'assigned', 'in_progress', 'done', 'cancelled')),
  assigned_worker_id uuid references auth.users(id),
  reservation_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists airbnb_turnovers_prop_idx on public.airbnb_turnovers(property_id, check_out_at);

-- ============================================
-- RESERVATIONS — table centrale
-- ============================================
create table if not exists public.reservations (
  id uuid primary key default uuid_generate_v4(),

  -- client (soit user_id si compte, soit guest_*)
  user_id uuid references auth.users(id) on delete set null,
  guest_name text,
  guest_phone text,
  guest_email text,

  -- service
  service_type text not null check (service_type in ('menage', 'airbnb', 'demenagement', 'chef', 'plombier')),
  payload jsonb not null default '{}'::jsonb, -- les étapes du tunnel

  -- adresse (référence si user a compte, sinon stocké dans payload)
  address_id uuid references public.addresses(id) on delete set null,

  -- planning
  scheduled_at timestamptz,
  duration_min int,
  estimated_total_xof int,

  -- workflow
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'assigned', 'in_progress', 'done', 'cancelled')),
  deposit_status text not null default 'none'
    check (deposit_status in ('none', 'pending', 'paid', 'refunded')),
  deposit_kkiapay_tx text, -- id de transaction Kkiapay

  -- assignation (rempli par admin)
  assigned_worker_id uuid references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists reservations_user_idx on public.reservations(user_id);
create index if not exists reservations_status_idx on public.reservations(status);
create index if not exists reservations_scheduled_idx on public.reservations(scheduled_at);
create index if not exists reservations_worker_idx on public.reservations(assigned_worker_id);

-- ============================================
-- REVIEWS — notes et avis après prestation
-- ============================================
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

-- ============================================
-- RLS POLICIES
-- ============================================
alter table public.profiles enable row level security;
alter table public.addresses enable row level security;
alter table public.reservations enable row level security;
alter table public.airbnb_properties enable row level security;
alter table public.airbnb_turnovers enable row level security;
alter table public.worker_skills enable row level security;
alter table public.worker_zones enable row level security;
alter table public.worker_availability enable row level security;
alter table public.worker_blackouts enable row level security;
alter table public.reviews enable row level security;

-- helper : is_admin
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- helper : is_worker
create or replace function public.is_worker()
returns boolean
language sql
security definer
stable
as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role in ('worker','admin'));
$$;

-- profiles
create policy "users read own profile" on public.profiles for select using (auth.uid() = id or public.is_admin());
create policy "users update own profile" on public.profiles for update using (auth.uid() = id);
create policy "admin manages profiles" on public.profiles for all using (public.is_admin());

-- addresses
create policy "users manage own addresses" on public.addresses for all using (auth.uid() = user_id);
create policy "admin sees all addresses" on public.addresses for select using (public.is_admin());

-- reservations
create policy "users see own reservations" on public.reservations for select
  using (auth.uid() = user_id or public.is_admin() or (public.is_worker() and assigned_worker_id = auth.uid()));
-- résa invité autorisée, mais colonnes sensibles verrouillées (cf. migration 20260610) :
-- pas d'usurpation de user_id, pas de status/deposit_status/worker/tx forgés.
-- Le passage à deposit_status='paid' relève du service_role (vérif Kkiapay serveur).
create policy "users insert reservations" on public.reservations for insert
  with check (
    (user_id is null or user_id = auth.uid())
    and status = 'pending'
    and deposit_status in ('none', 'pending')
    and assigned_worker_id is null
    and deposit_kkiapay_tx is null
  );
create policy "users update own reservation status" on public.reservations for update using (auth.uid() = user_id or public.is_admin());
create policy "admin manages reservations" on public.reservations for all using (public.is_admin());

-- Verrou des champs sensibles sur UPDATE (cf. migration 20260610) : un non-admin
-- ne peut qu'annuler sa résa, jamais forger deposit_status/worker/montant/user_id.
create or replace function public.lock_reservation_sensitive_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() or auth.role() = 'service_role' then
    return new;
  end if;
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
drop trigger if exists reservations_lock_sensitive on public.reservations;
create trigger reservations_lock_sensitive
  before update on public.reservations
  for each row execute function public.lock_reservation_sensitive_fields();

-- worker tables (lecture réservée aux utilisateurs connectés — matching admin ; écriture admin)
create policy "auth reads worker skills" on public.worker_skills for select using (auth.uid() is not null);
create policy "auth reads worker zones" on public.worker_zones for select using (auth.uid() is not null);
create policy "auth reads worker avail" on public.worker_availability for select using (auth.uid() is not null);
create policy "worker reads own blackouts" on public.worker_blackouts for select using (auth.uid() = worker_id or public.is_admin());
create policy "admin manages worker data" on public.worker_skills for all using (public.is_admin());
create policy "admin manages worker zones" on public.worker_zones for all using (public.is_admin());
create policy "admin manages worker availability" on public.worker_availability for all using (public.is_admin());
create policy "admin manages worker blackouts" on public.worker_blackouts for all using (public.is_admin());

-- airbnb properties (hosts = owners)
create policy "owner manages property" on public.airbnb_properties for all using (auth.uid() = owner_user_id or public.is_admin());
create policy "owner reads turnovers" on public.airbnb_turnovers for select
  using (
    public.is_admin()
    or exists (select 1 from public.airbnb_properties p where p.id = property_id and p.owner_user_id = auth.uid())
    or (public.is_worker() and assigned_worker_id = auth.uid())
  );
create policy "admin manages turnovers" on public.airbnb_turnovers for all using (public.is_admin());

-- reviews
-- Insert : le client peut noter UNIQUEMENT sa résa terminée (status='done')
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
-- Select : le client voit ses propres avis ; l'admin voit tout ; le worker voit les avis le concernant
create policy "customer reads own reviews" on public.reviews for select
  using (
    auth.uid() = customer_id
    or public.is_admin()
    or (public.is_worker() and worker_id = auth.uid())
  );
-- Update / Delete : admin uniquement (un avis ne se modifie pas par le client une fois posté)
create policy "admin manages reviews" on public.reviews for all using (public.is_admin());

-- Fonction publique pour la note moyenne affichée sur la home (security definer car la table reviews est en RLS)
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

-- Fonction admin pour les stats par worker
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

-- ============================================
-- NOTIFICATION WHATSAPP À CHAQUE NOUVELLE RÉSA
-- Sera implémentée via Edge Function Supabase (cf. supabase/functions/notify-whatsapp/)
-- ============================================
