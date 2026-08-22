-- ===========================================================
-- 0040 · NÚCLEO DE PLATAFORMA MULTIEMPRESA
-- -----------------------------------------------------------
-- Convierte esta base en la base de la PLATAFORMA ANIMA.
-- Es 100% aditiva: no toca ni una tabla, columna o política
-- existente. ANIMA sigue funcionando exactamente igual.
--
-- Modelo:  auth.users → profiles → company_members → roles → permissions
-- Aislamiento: company_id + RLS, verificado en PostgreSQL.
--
-- Lecciones aplicadas de la auditoría del 22-08-2026:
--   · toda función es SECURITY DEFINER con search_path fijo
--   · a ninguna se le concede EXECUTE al rol anon
--   · las políticas usan (select auth.uid()), no auth.uid(),
--     para no reevaluar el JWT fila por fila
--   · toda clave foránea lleva índice de cobertura
-- ===========================================================

-- ---------- ENUMS ----------
do $$ begin
  create type public.company_status as enum ('trial','active','suspended','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.member_status as enum ('invited','active','suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.role_scope as enum ('platform','company');
exception when duplicate_object then null; end $$;

-- ---------- PROFILES ----------
-- Identidad a nivel de plataforma. Convive con `almas` (identidad
-- de ANIMA Creator); no la reemplaza ni la modifica.
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  avatar_url  text,
  phone       text,
  locale      text not null default 'es',
  timezone    text not null default 'America/Santiago',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.profiles is 'Identidad de plataforma, 1:1 con auth.users.';

-- ---------- SUPER ADMIN DE PLATAFORMA ----------
-- Deliberadamente separado de los roles de empresa: ser dueño de
-- una empresa nunca puede escalar a administrar la plataforma.
create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  note       text
);
comment on table public.platform_admins is 'Propietarios/soporte de la plataforma. NO es un rol de empresa.';

-- ---------- COMPANIES (el tenant) ----------
create table if not exists public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  status      public.company_status not null default 'trial',
  country     text not null default 'CL',
  currency    text not null default 'CLP',
  timezone    text not null default 'America/Santiago',
  locale      text not null default 'es',
  branding    jsonb not null default '{}'::jsonb,
  settings    jsonb not null default '{}'::jsonb,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint companies_slug_format check (slug ~ '^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])$')
);
comment on column public.companies.slug is 'Identificador para subdominio: <slug>.plataforma.com';

-- ---------- ROLES Y PERMISOS ----------
create table if not exists public.roles (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  scope       public.role_scope not null default 'company',
  level       int  not null default 10,
  description text
);
comment on column public.roles.level is 'Mayor nivel = más autoridad. Comparar con >= , nunca por slug.';

create table if not exists public.permissions (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  module_slug text,
  description text
);

create table if not exists public.role_permissions (
  role_id       uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

-- ---------- PERTENENCIA A EMPRESA ----------
-- Un usuario puede pertenecer a varias empresas con distinto rol.
create table if not exists public.company_members (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id    uuid not null references auth.users(id)      on delete cascade,
  role_id    uuid not null references public.roles(id),
  status     public.member_status not null default 'active',
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id)
);

-- ---------- MÓDULOS ----------
create table if not exists public.modules (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text,
  active      boolean not null default true,
  sort        int not null default 100
);

create table if not exists public.company_modules (
  company_id    uuid not null references public.companies(id) on delete cascade,
  module_id     uuid not null references public.modules(id)   on delete cascade,
  enabled       boolean not null default false,
  configuration jsonb   not null default '{}'::jsonb,
  updated_at    timestamptz not null default now(),
  primary key (company_id, module_id)
);

-- ---------- AUDITORÍA ----------
-- Inmutable por diseño: no existe política de UPDATE ni DELETE.
create table if not exists public.audit_logs (
  id         bigint generated always as identity primary key,
  company_id uuid references public.companies(id) on delete cascade,
  user_id    uuid references auth.users(id)       on delete set null,
  action     text not null,
  entity     text,
  entity_id  text,
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
comment on table public.audit_logs is 'company_id nulo = acción de plataforma (Super Admin).';

-- ---------- ÍNDICES (toda FK con cobertura) ----------
create index if not exists companies_created_by_idx    on public.companies(created_by);
create index if not exists companies_status_idx        on public.companies(status);
create index if not exists company_members_company_idx on public.company_members(company_id);
create index if not exists company_members_user_idx    on public.company_members(user_id);
create index if not exists company_members_role_idx    on public.company_members(role_id);
create index if not exists company_modules_module_idx  on public.company_modules(module_id);
create index if not exists role_permissions_perm_idx   on public.role_permissions(permission_id);
create index if not exists audit_logs_company_time_idx on public.audit_logs(company_id, created_at desc);
create index if not exists audit_logs_user_idx         on public.audit_logs(user_id);
create index if not exists platform_admins_granted_idx on public.platform_admins(granted_by);

-- ===========================================================
-- FUNCIONES DE SEGURIDAD
-- SECURITY DEFINER para poder consultarse desde dentro de las
-- propias políticas sin recursión infinita.
-- ===========================================================

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.platform_admins pa where pa.user_id = (select auth.uid()));
$$;

create or replace function public.current_company_ids()
returns setof uuid language sql stable security definer set search_path = public, pg_temp as $$
  select cm.company_id from public.company_members cm
  where cm.user_id = (select auth.uid()) and cm.status = 'active';
$$;

create or replace function public.is_company_member(p_company uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.company_members cm
    where cm.company_id = p_company
      and cm.user_id = (select auth.uid())
      and cm.status = 'active'
  );
$$;

create or replace function public.company_role_level(p_company uuid)
returns int language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(max(r.level), 0)
  from public.company_members cm
  join public.roles r on r.id = cm.role_id
  where cm.company_id = p_company
    and cm.user_id = (select auth.uid())
    and cm.status = 'active';
$$;

-- Autoridad efectiva: el Super Admin de plataforma pasa por encima.
create or replace function public.has_company_level(p_company uuid, p_min int)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_platform_admin() or public.company_role_level(p_company) >= p_min;
$$;

-- Ninguna de estas funciones debe ser invocable sin sesión.
revoke execute on function public.is_platform_admin()                     from public, anon;
revoke execute on function public.current_company_ids()                   from public, anon;
revoke execute on function public.is_company_member(uuid)                 from public, anon;
revoke execute on function public.company_role_level(uuid)                from public, anon;
revoke execute on function public.has_company_level(uuid,int)             from public, anon;
grant  execute on function public.is_platform_admin()                     to authenticated;
grant  execute on function public.current_company_ids()                   to authenticated;
grant  execute on function public.is_company_member(uuid)                 to authenticated;
grant  execute on function public.company_role_level(uuid)                to authenticated;
grant  execute on function public.has_company_level(uuid,int)             to authenticated;

-- ---------- Perfil automático al registrarse ----------
-- Trigger PROPIO: no toca `on_auth_user_created` (que crea el Alma).
create or replace function public.handle_new_platform_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email,''), coalesce(new.raw_user_meta_data->>'name',''))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_platform_user();

-- ---------- Quien crea una empresa queda como owner ----------
create or replace function public.handle_new_company()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_owner uuid;
begin
  select id into v_owner from public.roles where slug = 'owner' limit 1;
  if new.created_by is not null and v_owner is not null then
    insert into public.company_members (company_id, user_id, role_id, status)
    values (new.id, new.created_by, v_owner, 'active')
    on conflict (company_id, user_id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists on_company_created on public.companies;
create trigger on_company_created
  after insert on public.companies
  for each row execute function public.handle_new_company();

-- ---------- updated_at ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists companies_touch       on public.companies;
drop trigger if exists profiles_touch        on public.profiles;
drop trigger if exists company_members_touch on public.company_members;
create trigger companies_touch       before update on public.companies       for each row execute function public.touch_updated_at();
create trigger profiles_touch        before update on public.profiles        for each row execute function public.touch_updated_at();
create trigger company_members_touch before update on public.company_members for each row execute function public.touch_updated_at();

-- ===========================================================
-- ROW LEVEL SECURITY
-- Regla: un usuario de la Empresa A no puede SELECT/INSERT/
-- UPDATE/DELETE nada de la Empresa B. Se verifica en Postgres.
-- ===========================================================
alter table public.profiles        enable row level security;
alter table public.platform_admins enable row level security;
alter table public.companies       enable row level security;
alter table public.roles           enable row level security;
alter table public.permissions     enable row level security;
alter table public.role_permissions enable row level security;
alter table public.company_members enable row level security;
alter table public.modules         enable row level security;
alter table public.company_modules enable row level security;
alter table public.audit_logs      enable row level security;

-- PROFILES: el propio, los de empresas que comparto, y el Super Admin.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or public.is_platform_admin()
    or exists (
      select 1 from public.company_members mine
      join public.company_members theirs on theirs.company_id = mine.company_id
      where mine.user_id = (select auth.uid()) and mine.status='active'
        and theirs.user_id = public.profiles.id
    )
  );
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid()) or public.is_platform_admin())
  with check (id = (select auth.uid()) or public.is_platform_admin());

-- PLATFORM_ADMINS: solo la plataforma se ve y se administra a sí misma.
drop policy if exists platform_admins_all on public.platform_admins;
create policy platform_admins_all on public.platform_admins for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- COMPANIES
drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies for select to authenticated
  using (public.is_company_member(id) or public.is_platform_admin());
drop policy if exists companies_insert on public.companies;
create policy companies_insert on public.companies for insert to authenticated
  with check (created_by = (select auth.uid()));
drop policy if exists companies_update on public.companies;
create policy companies_update on public.companies for update to authenticated
  using (public.has_company_level(id, 80)) with check (public.has_company_level(id, 80));
drop policy if exists companies_delete on public.companies;
create policy companies_delete on public.companies for delete to authenticated
  using (public.is_platform_admin());

-- CATÁLOGOS GLOBALES: lectura para usuarios con sesión, escritura solo plataforma.
drop policy if exists roles_read on public.roles;
create policy roles_read on public.roles for select to authenticated using (true);
drop policy if exists roles_write on public.roles;
create policy roles_write on public.roles for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists permissions_read on public.permissions;
create policy permissions_read on public.permissions for select to authenticated using (true);
drop policy if exists permissions_write on public.permissions;
create policy permissions_write on public.permissions for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists role_permissions_read on public.role_permissions;
create policy role_permissions_read on public.role_permissions for select to authenticated using (true);
drop policy if exists role_permissions_write on public.role_permissions;
create policy role_permissions_write on public.role_permissions for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists modules_read on public.modules;
create policy modules_read on public.modules for select to authenticated using (true);
drop policy if exists modules_write on public.modules;
create policy modules_write on public.modules for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- COMPANY_MEMBERS: se ve dentro de la empresa; se administra desde admin (80).
drop policy if exists company_members_select on public.company_members;
create policy company_members_select on public.company_members for select to authenticated
  using (public.is_company_member(company_id) or public.is_platform_admin());
drop policy if exists company_members_write on public.company_members;
create policy company_members_write on public.company_members for all to authenticated
  using (public.has_company_level(company_id, 80))
  with check (public.has_company_level(company_id, 80));

-- COMPANY_MODULES: los ve la empresa; los enciende un admin o la plataforma.
drop policy if exists company_modules_select on public.company_modules;
create policy company_modules_select on public.company_modules for select to authenticated
  using (public.is_company_member(company_id) or public.is_platform_admin());
drop policy if exists company_modules_write on public.company_modules;
create policy company_modules_write on public.company_modules for all to authenticated
  using (public.has_company_level(company_id, 80))
  with check (public.has_company_level(company_id, 80));

-- AUDIT_LOGS: lectura desde manager (60); escritura del propio miembro;
-- sin UPDATE ni DELETE para nadie: el registro es inmutable.
drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (
    (company_id is not null and public.has_company_level(company_id, 60))
    or (company_id is null and public.is_platform_admin())
  );
drop policy if exists audit_logs_insert on public.audit_logs;
create policy audit_logs_insert on public.audit_logs for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (company_id is null or public.is_company_member(company_id))
  );

-- ===========================================================
-- STORAGE · un archivo privado siempre vive bajo su empresa
-- Ruta: bucket "companies" → <company_id>/<area>/<archivo>
-- ===========================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('companies','companies', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists companies_files_read   on storage.objects;
create policy companies_files_read on storage.objects for select to authenticated
  using (
    bucket_id = 'companies'
    and (
      public.is_platform_admin()
      or (nullif((storage.foldername(name))[1],'')::uuid) in (select public.current_company_ids())
    )
  );

drop policy if exists companies_files_insert on storage.objects;
create policy companies_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'companies'
    and (nullif((storage.foldername(name))[1],'')::uuid) in (select public.current_company_ids())
  );

drop policy if exists companies_files_update on storage.objects;
create policy companies_files_update on storage.objects for update to authenticated
  using (
    bucket_id = 'companies'
    and (nullif((storage.foldername(name))[1],'')::uuid) in (select public.current_company_ids())
  );

drop policy if exists companies_files_delete on storage.objects;
create policy companies_files_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'companies'
    and public.has_company_level((nullif((storage.foldername(name))[1],'')::uuid), 60)
  );

-- ===========================================================
-- SEMILLA: roles, permisos base y catálogo de módulos
-- ===========================================================
insert into public.roles (slug, name, scope, level, description) values
  ('platform_admin','Super Admin','platform',1000,'Propietario y soporte de la plataforma. Autoridad real en platform_admins.'),
  ('owner',         'Propietario','company',  100, 'Dueño de la empresa.'),
  ('admin',         'Administrador','company', 80, 'Configura la empresa, sus miembros y sus módulos.'),
  ('manager',       'Encargado','company',     60, 'Opera y ve información sensible del área.'),
  ('employee',      'Empleado','company',      40, 'Trabaja sobre los datos del día a día.'),
  ('viewer',        'Lectura','company',       20, 'Solo consulta.')
on conflict (slug) do nothing;

insert into public.modules (slug, name, description, sort) values
  ('core',      'Core',        'Empresa, usuarios, roles y configuración. Siempre activo.', 10),
  ('crm',       'CRM',         'Clientes, contactos y seguimiento.',                        20),
  ('commerce',  'Commerce',    'Catálogo, carrito, pedidos y checkout.',                    30),
  ('operations','Operaciones', 'Inventario, compras y movimientos.',                        40),
  ('delivery',  'Delivery',    'Repartos, rutas y entregas.',                               50),
  ('food',      'Food',        'Cocina, estados de pedido y horarios.',                     60),
  ('creator',   'Creator',     'Portafolio, cotizaciones y proyectos creativos (ANIMA).',   70),
  ('finance',   'Finanzas',    'Ingresos, egresos y cuentas por cobrar.',                   80),
  ('agenda',    'Agenda',      'Calendario, citas y recordatorios.',                        90),
  ('support',   'Soporte',     'Tickets y centro de ayuda.',                               100),
  ('ai',        'IA',          'Asistente y automatizaciones.',                            110)
on conflict (slug) do nothing;

insert into public.permissions (slug, module_slug, description) values
  ('core.company.read',   'core','Ver la empresa'),
  ('core.company.update', 'core','Editar la empresa'),
  ('core.members.read',   'core','Ver miembros'),
  ('core.members.manage', 'core','Invitar, editar y quitar miembros'),
  ('core.modules.manage', 'core','Activar y desactivar módulos'),
  ('core.audit.read',     'core','Ver el registro de auditoría')
on conflict (slug) do nothing;

-- owner y admin reciben todos los permisos de core
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.slug in ('owner','admin') and p.module_slug = 'core'
on conflict do nothing;

-- manager: lectura + auditoría
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.slug = 'manager' and p.slug in ('core.company.read','core.members.read','core.audit.read')
on conflict do nothing;

-- employee y viewer: solo lectura básica
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.slug in ('employee','viewer') and p.slug in ('core.company.read','core.members.read')
on conflict do nothing;
