-- ===========================================================
-- 0095 · CAPITAL INTELLIGENCE — el núcleo
-- -----------------------------------------------------------
-- Un módulo de ANIMA COMPANY para quien analiza proyectos, los
-- mide y levanta capital para ellos. Cuatro niveles:
--
--   organización → portafolio → proyecto → unidad de negocio
--
-- La organización ya existe: es `companies`. Lo demás se agrega
-- aquí, con el prefijo `ci_` por una razón concreta: `projects`
-- ya está ocupada por el Taller de ANIMA STUDIO —lleva `alma_id`,
-- `pct`, `checklist`— y meter proyectos de inversión ahí
-- rompería las dos cosas a la vez.
--
-- Aditiva de principio a fin: no toca ni una tabla existente.
--
-- Sobre los catálogos: `project_type`, `status`, `stage` y
-- `risk_level` son texto, no enums. El brief pide que sean
-- CONFIGURABLES, y un enum de PostgreSQL obliga a una migración
-- para agregar "Proyecto personalizado". Las opciones se declaran
-- en el esquema del frontend, que es donde se leen.
-- Lleva check solo lo que decide comportamiento.
-- ===========================================================

-- ---------- PORTAFOLIOS ----------
-- Agrupación de proyectos. Una firma de asesoría puede tener uno
-- por cliente; un holding, uno por vertical.
create table if not exists public.ci_portfolios (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  name          text not null,
  code          text,
  description   text,
  -- La moneda en la que se consolida ESTE portafolio. Puede diferir
  -- de la de la empresa: un holding en Colombia con un proyecto en
  -- Costa Rica consolida en USD sin cambiar la moneda de la empresa.
  base_currency text not null default 'USD',
  manager       text,
  status        text not null default 'activo',
  notes         text,
  custom        jsonb not null default '{}'::jsonb,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
comment on table public.ci_portfolios is
  'Capital Intelligence · agrupación de proyectos de una organización.';

-- ---------- PROYECTOS ----------
-- La unidad de análisis: una oportunidad de inversión o de
-- transformación. Todo lo demás cuelga de aquí.
create table if not exists public.ci_projects (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id)     on delete cascade,
  portfolio_id   uuid references public.ci_portfolios(id)          on delete set null,

  name           text not null,
  code           text,                       -- lo pone next_code(): PRY-2026-000001
  project_type   text not null default 'nueva_unidad',
  country        text,
  city           text,
  industry       text,
  owner          text,                       -- responsable, en texto: puede no tener cuenta
  status         text not null default 'borrador',
  stage          text,

  -- La tesis. Un proyecto sin esto es una planilla sin argumento.
  description        text,
  investment_thesis  text,
  problem            text,
  business_model     text,
  revenue_sources    text,

  start_date     date,
  horizon_months int  not null default 60,
  currency       text not null default 'USD',

  -- Capital. `capital_committed` lo mantiene la Fase 2 (rondas);
  -- en Fase 1 se escribe a mano y las validaciones ya lo revisan.
  capital_required   numeric(18,2) not null default 0,
  capital_committed  numeric(18,2) not null default 0,
  equity_offered_pct numeric(7,4),
  pre_money          numeric(18,2),
  post_money         numeric(18,2),
  instrument         text,
  risk_level         text not null default 'medio',

  notes          text,
  custom         jsonb not null default '{}'::jsonb,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,

  constraint ci_projects_horizonte_positivo check (horizon_months between 1 and 480),
  constraint ci_projects_equity_rango       check (equity_offered_pct is null
                                                   or (equity_offered_pct >= 0 and equity_offered_pct <= 100)),
  constraint ci_projects_code_unico         unique (company_id, code)
);
comment on table public.ci_projects is
  'Capital Intelligence · una oportunidad de inversión o transformación.';
comment on column public.ci_projects.currency is
  'Moneda principal del proyecto. Los importes se guardan en ella y se convierten con ci_exchange_rates.';

-- ---------- UNIDADES DE NEGOCIO ----------
-- Marcas, locales, canales o conceptos dentro de un proyecto.
-- Es lo que permite que una plataforma multiconcepto tenga costos
-- comunes en el proyecto e ingresos separados por unidad.
create table if not exists public.ci_business_units (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id)   on delete cascade,
  project_id  uuid not null references public.ci_projects(id) on delete cascade,
  name        text not null,
  unit_type   text not null default 'marca',
  status      text not null default 'planificada',
  launch_date date,
  -- Capacidad instalada: metros, puestos, horas. Es lo que hace
  -- posible "ingreso por m²" o "por hora de cocina" sin que el
  -- sistema sepa nada de gastronomía.
  capacity        numeric(18,4),
  capacity_unit   text,
  notes       text,
  custom      jsonb not null default '{}'::jsonb,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
comment on table public.ci_business_units is
  'Capital Intelligence · marca, local, canal o concepto dentro de un proyecto.';

-- ---------- QUIÉN VE QUÉ PROYECTO ----------
-- El permiso por empresa no alcanza: un inversionista entra a la
-- organización para ver UN proyecto, no todos. Esta tabla es la
-- que hace posible ese rol, y la lee RLS en 0096.
create table if not exists public.ci_project_members (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id)   on delete cascade,
  project_id uuid not null references public.ci_projects(id) on delete cascade,
  user_id    uuid not null references auth.users(id)         on delete cascade,
  -- lector: solo mira · colaborador: carga y edita · responsable: además aprueba
  access     text not null default 'lector'
             check (access in ('lector','colaborador','responsable')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);
comment on table public.ci_project_members is
  'Capital Intelligence · acceso por proyecto. Existe para el rol Inversionista: pertenecer a la organización no debe abrir todos los proyectos.';

-- ---------- HITOS ----------
create table if not exists public.ci_milestones (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id)   on delete cascade,
  project_id  uuid not null references public.ci_projects(id) on delete cascade,
  name        text not null,
  description text,
  due_date    date,
  done_date   date,
  status      text not null default 'pendiente',
  owner       text,
  -- Capital que este hito condiciona. Un tramo que se libera al
  -- abrir el local es un hito con monto, no una nota al pie.
  amount_conditioned numeric(18,2),
  sort        int not null default 0,
  custom      jsonb not null default '{}'::jsonb,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
comment on table public.ci_milestones is
  'Capital Intelligence · hitos de un proyecto, con el capital que condicionan.';

-- ---------- ÍNDICES (toda FK con cobertura) ----------
create index if not exists ci_portfolios_company_idx      on public.ci_portfolios(company_id) where deleted_at is null;
create index if not exists ci_projects_company_idx        on public.ci_projects(company_id)   where deleted_at is null;
create index if not exists ci_projects_portfolio_idx      on public.ci_projects(portfolio_id);
create index if not exists ci_projects_status_idx         on public.ci_projects(company_id, status);
create index if not exists ci_business_units_company_idx  on public.ci_business_units(company_id);
create index if not exists ci_business_units_project_idx  on public.ci_business_units(project_id);
create index if not exists ci_project_members_company_idx on public.ci_project_members(company_id);
create index if not exists ci_project_members_project_idx on public.ci_project_members(project_id);
create index if not exists ci_project_members_user_idx    on public.ci_project_members(user_id);
create index if not exists ci_milestones_company_idx      on public.ci_milestones(company_id);
create index if not exists ci_milestones_project_idx      on public.ci_milestones(project_id, due_date);

-- ---------- updated_at ----------
do $$
declare t text;
begin
  foreach t in array array['ci_portfolios','ci_projects','ci_business_units','ci_milestones'] loop
    execute format('drop trigger if exists %I on public.%I', t||'_touch', t);
    execute format('create trigger %I before update on public.%I
                    for each row execute function public.touch_updated_at()', t||'_touch', t);
  end loop;
end $$;

-- ---------- CAMPOS PROPIOS ----------
-- El mismo trigger que valida `custom` en el resto de la plataforma.
-- Sin esto, un campo propio declarado sobre un proyecto entraría sin
-- que nadie revisara su tipo. `validate_custom` usa `tg_table_name`,
-- así que la `entity` de custom_fields es el nombre de la tabla.
do $$
declare t text;
begin
  foreach t in array array['ci_portfolios','ci_projects','ci_business_units','ci_milestones'] loop
    execute format('drop trigger if exists %I on public.%I', t||'_validate_custom', t);
    execute format('create trigger %I before insert or update of custom on public.%I
                    for each row execute function public.trg_validate_custom()', t||'_validate_custom', t);
  end loop;
end $$;

-- ---------- CÓDIGO DEL PROYECTO ----------
-- Se pone solo, como el de un pedido. Que lo escriba una persona
-- garantiza dos proyectos con el mismo código antes de fin de mes.
create or replace function public.ci_project_code()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.code is null or btrim(new.code) = '' then
    new.code := public.next_code(new.company_id, 'PRY');
  end if;
  return new;
end $$;
revoke execute on function public.ci_project_code() from public, anon, authenticated;

drop trigger if exists ci_projects_code on public.ci_projects;
create trigger ci_projects_code before insert on public.ci_projects
  for each row execute function public.ci_project_code();

-- ---------- COHERENCIA ENTRE NIVELES ----------
-- Una unidad de negocio de la empresa A colgando de un proyecto de
-- la empresa B sería una fuga de datos que RLS no vería: las dos
-- filas tendrían su company_id correcto. Se corta aquí.
create or replace function public.ci_misma_empresa()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_owner uuid;
begin
  execute format('select company_id from public.%I where id = $1', tg_argv[0])
    into v_owner using (to_jsonb(new) ->> tg_argv[1])::uuid;
  if v_owner is not null and v_owner <> new.company_id then
    raise exception 'El % pertenece a otra organización', tg_argv[1];
  end if;
  return new;
end $$;
revoke execute on function public.ci_misma_empresa() from public, anon, authenticated;

drop trigger if exists ci_projects_misma_empresa on public.ci_projects;
create trigger ci_projects_misma_empresa before insert or update of portfolio_id on public.ci_projects
  for each row when (new.portfolio_id is not null)
  execute function public.ci_misma_empresa('ci_portfolios', 'portfolio_id');

drop trigger if exists ci_business_units_misma_empresa on public.ci_business_units;
create trigger ci_business_units_misma_empresa before insert or update of project_id on public.ci_business_units
  for each row execute function public.ci_misma_empresa('ci_projects', 'project_id');

drop trigger if exists ci_milestones_misma_empresa on public.ci_milestones;
create trigger ci_milestones_misma_empresa before insert or update of project_id on public.ci_milestones
  for each row execute function public.ci_misma_empresa('ci_projects', 'project_id');

drop trigger if exists ci_project_members_misma_empresa on public.ci_project_members;
create trigger ci_project_members_misma_empresa before insert or update of project_id on public.ci_project_members
  for each row execute function public.ci_misma_empresa('ci_projects', 'project_id');
