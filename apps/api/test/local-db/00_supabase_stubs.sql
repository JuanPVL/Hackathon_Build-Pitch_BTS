-- =====================================================================
-- SOLO DESARROLLO / PRUEBAS LOCALES. NO es una migración del producto.
-- Emula lo mínimo que Supabase ya trae en un proyecto real para poder cargar
-- 01..05 en un PostgreSQL limpio y hacer `drizzle-kit pull` y las pruebas e2e:
--   * roles anon / authenticated / service_role (este último con BYPASSRLS)
--   * esquema auth con auth.users y auth.uid() leyendo request.jwt.claims
--   * los privilegios por defecto que Supabase concede en el esquema public
-- Nunca se ejecuta contra la base de Supabase en vivo.
-- =====================================================================
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

-- El usuario con el que se conecta la app puede hacer SET ROLE a estos roles (como "authenticator" en Supabase).
grant anon, authenticated, service_role to current_user;

create schema if not exists auth;
create table if not exists auth.users (
  id    uuid primary key,
  email text
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true),
                         (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid
$$;
create or replace function auth.role() returns text
language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.role', true),
                         (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')), '')::text
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;

-- Privilegios por defecto de Supabase en public (las policies de RLS hacen el recorte).
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
