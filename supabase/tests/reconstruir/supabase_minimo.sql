-- =====================================================================
-- Lo mínimo de Supabase para aplicar las migraciones en un Postgres vacío.
--
-- No es Supabase: son las piezas que las migraciones nombran (roles,
-- auth.uid(), storage, cron, net, vault, la publicación de realtime) con la
-- forma justa para que el SQL compile y las políticas se puedan crear.
-- Sirve para una sola pregunta: ¿el repo reconstruye el esquema?
-- =====================================================================

do $$ begin
  create role anon nologin noinherit;
exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated nologin noinherit;
exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role nologin noinherit bypassrls;
exception when duplicate_object then null; end $$;
do $$ begin
  create role supabase_admin nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role supabase_auth_admin nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role supabase_storage_admin nologin;
exception when duplicate_object then null; end $$;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
-- Supabase tiene `extensions` en el search_path de todos.
alter database postgres set search_path = "$user", public, extensions;
set search_path = "$user", public, extensions;

-- ---------------------------------------------------------------- auth
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid,
  aud text, role text,
  email text unique,
  encrypted_password text,
  email_confirmed_at timestamptz,
  invited_at timestamptz,
  confirmation_token text, recovery_token text,
  email_change text, email_change_token_new text,
  last_sign_in_at timestamptz,
  raw_app_meta_data jsonb default '{}'::jsonb,
  raw_user_meta_data jsonb default '{}'::jsonb,
  is_super_admin boolean,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  phone text unique,
  banned_until timestamptz,
  deleted_at timestamptz,
  is_anonymous boolean default false
);
create table if not exists auth.identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  provider text, provider_id text, identity_data jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(auth.jwt() ->> 'role', 'anon')
$$;
create or replace function auth.email() returns text language sql stable as $$
  select auth.jwt() ->> 'email'
$$;
grant usage on schema auth to anon, authenticated, service_role;

-- ------------------------------------------------------------- storage
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key, name text unique not null, owner uuid,
  public boolean default false, file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text, owner uuid, metadata jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  last_accessed_at timestamptz default now()
);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[]
  language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
create or replace function storage.filename(name text) returns text
  language sql immutable as $$ select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)] $$;
create or replace function storage.extension(name text) returns text
  language sql immutable as $$ select split_part(storage.filename(name), '.', -1) $$;
grant usage on schema storage to anon, authenticated, service_role;

-- --------------------------------------------- cron (pg_cron) y net (pg_net)
-- Las migraciones llaman `create extension pg_cron/pg_net`; el script de
-- reconstrucción las convierte en comentario. Aquí van sus funciones.
create schema if not exists cron;
create table if not exists cron.job (
  jobid bigserial primary key, schedule text, command text,
  jobname text unique, active boolean default true
);
create or replace function cron.schedule(job_name text, schedule text, command text)
returns bigint language plpgsql as $$
declare v bigint;
begin
  insert into cron.job(jobname, schedule, command) values (job_name, schedule, command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
  returning jobid into v;
  return v;
end $$;
create or replace function cron.unschedule(job_name text) returns boolean
  language sql as $$ delete from cron.job where jobname = job_name returning true $$;

create schema if not exists net;
create or replace function net.http_post(url text, body jsonb default '{}'::jsonb,
  params jsonb default '{}'::jsonb, headers jsonb default '{}'::jsonb,
  timeout_milliseconds int default 5000) returns bigint
  language sql as $$ select 0::bigint $$;
create or replace function net.http_get(url text, params jsonb default '{}'::jsonb,
  headers jsonb default '{}'::jsonb, timeout_milliseconds int default 5000) returns bigint
  language sql as $$ select 0::bigint $$;
-- Hay migraciones que lo esperan en `extensions`.
create or replace function extensions.http_post(url text, body jsonb default '{}'::jsonb,
  params jsonb default '{}'::jsonb, headers jsonb default '{}'::jsonb,
  timeout_milliseconds int default 5000) returns bigint
  language sql as $$ select 0::bigint $$;

-- --------------------------------------------------------------- vault
create schema if not exists vault;
create table if not exists vault.secrets (
  id uuid primary key default gen_random_uuid(),
  name text unique, description text, secret text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create or replace view vault.decrypted_secrets as
  select id, name, description, secret, secret as decrypted_secret, created_at, updated_at from vault.secrets;
create or replace function vault.create_secret(new_secret text, new_name text default null,
  new_description text default '') returns uuid language sql as $$
  insert into vault.secrets(secret, name, description) values (new_secret, new_name, new_description) returning id
$$;
create or replace function vault.update_secret(secret_id uuid, new_secret text default null,
  new_name text default null, new_description text default null) returns void language sql as $$
  update vault.secrets set secret = coalesce(new_secret, secret), name = coalesce(new_name, name),
    description = coalesce(new_description, description), updated_at = now() where id = secret_id
$$;

-- ------------------------------------------------------------ realtime
do $$ begin
  create publication supabase_realtime;
exception when duplicate_object then null; end $$;

-- Permisos por defecto de Supabase sobre public.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- ------------------------------------------------- cuentas que se esperan
-- Algunas migraciones de datos (0069 y siguientes) buscan la cuenta del
-- Creador. En una base nueva no existe: se crea vacía, sin contraseña.
insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-00000000a001', 'sarkgraff@gmail.com', '{"name":"SARK"}')
on conflict do nothing;
