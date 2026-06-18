-- ============================================
-- MIGRATION 2026-06-18 — CORRECTIF SÉCU CRITIQUE
-- Escalade de privilège : un utilisateur pouvait se promouvoir `admin`
-- ============================================
-- À exécuter dans le SQL editor Supabase. Idempotent (create or replace +
-- drop trigger if exists + alter policy). DÉJÀ APPLIQUÉE EN PROD le 2026-06-18.
--
-- FAILLE
-- ------
-- La policy "users update own profile" sur public.profiles était
--   `using (auth.uid() = id)` SANS `with check`.
-- Postgres réutilise alors le USING comme contrôle post-écriture ; comme `id`
-- ne change pas, l'expression reste vraie et l'UPDATE est accepté — y compris
-- `role := 'admin'`. L'enum autorise 'admin', le rôle `authenticated` a le GRANT
-- UPDATE par défaut, et AUCUN trigger ne verrouillait `role`. Comme toute la
-- sécurité repose sur is_admin()/profiles.role, n'importe quel compte client
-- pouvait prendre le contrôle TOTAL du back-office en une requête :
--   PATCH /rest/v1/profiles?id=eq.<son_uid>   body {"role":"admin"}
-- avec la simple clé anon publique. Prouvé sur la prod (transaction annulée) :
-- avant ce correctif, role passait bien à 'admin'.
--
-- CORRECTIF — double barrière (défense en profondeur)
-- ---------------------------------------------------
--   1) Trigger BEFORE UPDATE => `role` IMMUABLE pour les non-admins.
--      Barrière décisive, calquée sur lock_reservation_sensitive_fields.
--   2) WITH CHECK explicite sur la policy => `role` ne peut différer du rôle
--      courant de l'appelant (bloque l'escalade même si le trigger sautait).
--
-- Aucun flux légitime cassé : un utilisateur édite toujours full_name/phone/
-- avatar_url ; admin & service_role gardent la main sur les rôles. Bootstrap
-- du 1er admin : via SQL editor / service_role (auth.uid() IS NULL ou role
-- service_role => autorisé).

create or replace function public.lock_profile_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Contextes de confiance : admin connecté, clé service_role, ou superuser
  -- sans JWT (SQL editor / bootstrap du 1er admin). Un attaquant via l'API a
  -- TOUJOURS un auth.uid() non-null, et la RLS lui interdit d'updater une autre
  -- ligne que la sienne => il ne peut jamais atteindre ce trigger avec
  -- auth.uid() IS NULL.
  if public.is_admin()
     or auth.role() = 'service_role'
     or auth.uid() is null then
    return new;
  end if;
  -- Tout autre : `role` immuable. Le reste du profil reste éditable.
  new.role := old.role;
  return new;
end;
$$;

drop trigger if exists profiles_lock_role on public.profiles;
create trigger profiles_lock_role
  before update on public.profiles
  for each row execute function public.lock_profile_role();

-- 2e barrière au niveau policy : un UPDATE ne peut laisser `role` différent du
-- rôle courant de l'appelant. Les admins passent par "admin manages profiles"
-- (FOR ALL using is_admin()) qui, elle, autorise le changement de rôle.
alter policy "users update own profile" on public.profiles
  with check (
    auth.uid() = id
    and role = (select pr.role from public.profiles pr where pr.id = auth.uid())
  );
