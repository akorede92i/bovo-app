-- ============================================
-- MIGRATION 2026-06-07 — Device tokens (push)
-- ============================================
-- Stocke les jetons de push (FCM Android / APNs iOS) par appareil, liés à un
-- profil utilisateur, pour pouvoir notifier le client (suivi de réservation,
-- rappels, promos). À exécuter dans le SQL editor Supabase.
-- Idempotent : peut être rejouée sans casser quoi que ce soit.

create table if not exists public.device_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  token       text not null,
  platform    text not null check (platform in ('android', 'ios', 'web')),
  -- préférences d'opt-in par canal (pour distinguer suivi transactionnel vs promos)
  allow_transactional boolean not null default true,
  allow_marketing     boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (token)
);

create index if not exists device_tokens_user_idx on public.device_tokens(user_id);

-- maj automatique de updated_at
create or replace function public.touch_device_tokens_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists device_tokens_touch on public.device_tokens;
create trigger device_tokens_touch
  before update on public.device_tokens
  for each row execute function public.touch_device_tokens_updated_at();

-- RLS : chaque utilisateur ne gère que ses propres tokens ; l'admin peut lire.
alter table public.device_tokens enable row level security;

drop policy if exists "users manage own device tokens" on public.device_tokens;
create policy "users manage own device tokens" on public.device_tokens
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "admin reads device tokens" on public.device_tokens;
create policy "admin reads device tokens" on public.device_tokens
  for select using (public.is_admin());
