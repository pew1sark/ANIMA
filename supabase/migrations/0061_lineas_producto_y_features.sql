-- 0061 · LINEAS DE PRODUCTO, FEATURES Y NIVELES DE MODULO
-- Esta es la pieza que permite construir algo para UN cliente sin tocar a los
-- demas, y sin escribir nunca  if empresa = 'bilagay'.
--
-- La clave esta en features.stage: una funcionalidad nace 'custom' para un
-- cliente, se valida, pasa a 'beta' y termina 'oficial' ofrecida a todos.
-- Ese recorrido es un cambio de una columna, no una reescritura.

do $$ begin create type public.feature_stage as enum ('custom','beta','oficial','retirada');
exception when duplicate_object then null; end $$;
do $$ begin create type public.module_tier as enum ('basico','avanzado','enterprise');
exception when duplicate_object then null; end $$;

-- ---------- Lineas de producto ----------
create table if not exists public.product_lines (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  active boolean not null default true,
  sort int not null default 100
);
comment on table public.product_lines is 'STUDIO / COMPANY / INDUSTRY. Una organizacion pertenece a una.';

alter table public.companies add column if not exists product_line_id uuid references public.product_lines(id);
alter table public.plans     add column if not exists product_line_id uuid references public.product_lines(id);
create index if not exists companies_product_line_idx on public.companies(product_line_id);
create index if not exists plans_product_line_idx     on public.plans(product_line_id);

-- ---------- Niveles de modulo ----------
alter table public.company_modules add column if not exists tier public.module_tier not null default 'basico';
alter table public.plan_modules    add column if not exists max_tier public.module_tier not null default 'basico';

-- ---------- Features ----------
create table if not exists public.features (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  module_slug text references public.modules(slug),
  stage public.feature_stage not null default 'custom',
  -- Empresa que la encargo. Sirve para saber de donde vino, no para filtrar.
  origin_company_id uuid references public.companies(id) on delete set null,
  -- Si es 'oficial', se enciende sola para quien tenga el modulo
  default_enabled boolean not null default false,
  created_at timestamptz not null default now()
);
comment on column public.features.stage is 'custom → beta → oficial. El recorrido de un desarrollo a medida hasta producto.';

create table if not exists public.company_features (
  company_id uuid not null references public.companies(id) on delete cascade,
  feature_id uuid not null references public.features(id)  on delete cascade,
  enabled boolean not null default true,
  config  jsonb   not null default '{}'::jsonb,
  enabled_at timestamptz not null default now(),
  primary key (company_id, feature_id)
);
create index if not exists company_features_feature_idx on public.company_features(feature_id);

-- ---------- La pregunta que hace el codigo ----------
-- En vez de  if empresa = 'bilagay'  se escribe:
--   if (await supabase.rpc('company_has_feature', {p_feature: 'fish_reception'}))
create or replace function public.company_has_feature(p_feature text, p_company uuid default null)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  with c as (select coalesce(p_company, public.current_company()) as id),
       f as (select * from public.features where slug = p_feature)
  select case
    when not exists (select 1 from f) then false
    when not exists (select 1 from c where c.id is not null) then false
    -- Encendida explicitamente para esta empresa
    when exists (select 1 from public.company_features cf, c, f
                 where cf.company_id = c.id and cf.feature_id = f.id and cf.enabled) then true
    -- O es oficial, viene encendida por defecto, y la empresa tiene su modulo
    when (select stage from f) = 'oficial' and (select default_enabled from f) then
      coalesce(public.company_module_allowed((select id from c), (select module_slug from f)), false)
    else false
  end;
$$;

create or replace function public.company_feature_config(p_feature text, p_company uuid default null)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(cf.config, '{}'::jsonb)
  from public.company_features cf
  join public.features f on f.id = cf.feature_id and f.slug = p_feature
  where cf.company_id = coalesce(p_company, public.current_company()) and cf.enabled;
$$;

revoke execute on function public.company_has_feature(text,uuid)    from public, anon;
revoke execute on function public.company_feature_config(text,uuid) from public, anon;
grant  execute on function public.company_has_feature(text,uuid)    to authenticated;
grant  execute on function public.company_feature_config(text,uuid) to authenticated;

-- ---------- RLS ----------
alter table public.product_lines    enable row level security;
alter table public.features         enable row level security;
alter table public.company_features enable row level security;

drop policy if exists product_lines_read on public.product_lines;
create policy product_lines_read on public.product_lines for select to authenticated using (active);
drop policy if exists product_lines_write on public.product_lines;
create policy product_lines_write on public.product_lines for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Una empresa solo ve las features oficiales y las suyas.
-- Que exista una funcionalidad hecha para otro cliente no es asunto suyo.
drop policy if exists features_read on public.features;
create policy features_read on public.features for select to authenticated
  using (stage = 'oficial' or public.is_platform_admin()
         or exists (select 1 from public.company_features cf
                    where cf.feature_id = features.id and public.is_company_member(cf.company_id)));
drop policy if exists features_write on public.features;
create policy features_write on public.features for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists company_features_read on public.company_features;
create policy company_features_read on public.company_features for select to authenticated
  using (public.is_company_member(company_id) or public.is_platform_admin());
-- Solo la plataforma enciende funcionalidades: es lo que se cobra.
drop policy if exists company_features_write on public.company_features;
create policy company_features_write on public.company_features for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- ---------- SEMILLA ----------
insert into public.product_lines (slug, name, description, sort) values
 ('studio','ANIMA STUDIO','Creadores y profesionales independientes.',10),
 ('company','ANIMA COMPANY','Empresas con clientes, ventas y administracion.',20),
 ('industry','ANIMA INDUSTRY','Operacion fisica: compra, proceso, stock y reparto.',30)
on conflict (slug) do nothing;

update public.companies set product_line_id = (select id from public.product_lines where slug='studio')
 where slug='anima' and product_line_id is null;
update public.companies set product_line_id = (select id from public.product_lines where slug='industry')
 where slug='bilagay' and product_line_id is null;

update public.plans set product_line_id = (select id from public.product_lines where slug='company')
 where slug in ('starter','pro','business') and product_line_id is null;
update public.plans set product_line_id = (select id from public.product_lines where slug='industry')
 where slug='enterprise' and product_line_id is null;

-- La primera feature a medida: recepcion de pescado, encargada por Bilagay.
insert into public.features (slug, name, description, module_slug, stage, origin_company_id)
select 'fish_reception', 'Recepcion de pescado',
       'Especie, zona de captura, temperatura y control de cadena de frio en la recepcion.',
       'operations', 'custom', c.id
from public.companies c where c.slug='bilagay'
on conflict (slug) do nothing;

insert into public.company_features (company_id, feature_id, enabled)
select c.id, f.id, true
from public.companies c, public.features f
where c.slug='bilagay' and f.slug='fish_reception'
on conflict do nothing;