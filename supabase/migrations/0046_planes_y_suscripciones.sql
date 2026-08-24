-- ===========================================================
-- 0046 · CAPA COMERCIAL — planes, suscripciones y dominios
-- -----------------------------------------------------------
-- Hasta aquí la plataforma sabía separar empresas, pero no cobrarles.
--
-- Regla del negocio: un módulo se puede USAR si la empresa lo encendió
-- Y además su plan lo incluye. Encenderlo no basta: hay que pagarlo.
-- Verificado: bajando Bilagay de Business a Starter, commerce, operations,
-- delivery y finance siguen encendidos pero quedan NO disponibles.
-- ===========================================================

do $$ begin create type public.billing_cycle as enum ('mensual','anual');
exception when duplicate_object then null; end $$;
do $$ begin create type public.subscription_status as enum
  ('prueba','activa','morosa','pausada','cancelada','vencida');
exception when duplicate_object then null; end $$;
do $$ begin create type public.domain_kind as enum ('subdominio','propio');
exception when duplicate_object then null; end $$;
do $$ begin create type public.domain_status as enum ('pendiente','verificando','activo','error');
exception when duplicate_object then null; end $$;

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, name text not null, description text,
  price_amount bigint not null default 0,
  currency text not null default 'CLP',
  billing_cycle public.billing_cycle not null default 'mensual',
  max_users int,                        -- nulo = sin límite
  trial_days int not null default 0,
  features jsonb not null default '{}'::jsonb,
  active boolean not null default true, sort int not null default 100,
  created_at timestamptz not null default now()
);

create table if not exists public.plan_modules (
  plan_id   uuid not null references public.plans(id)   on delete cascade,
  module_id uuid not null references public.modules(id) on delete cascade,
  primary key (plan_id, module_id)
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  plan_id    uuid not null references public.plans(id),
  status public.subscription_status not null default 'prueba',
  price_amount bigint not null default 0,
  currency text not null default 'CLP',
  billing_cycle public.billing_cycle not null default 'mensual',
  started_at timestamptz not null default now(),
  trial_ends_at timestamptz,
  current_period_start timestamptz not null default now(),
  current_period_end   timestamptz,
  cancel_at timestamptz, cancelled_at timestamptz,
  -- La pasarela vive fuera: aquí solo referencias, NUNCA datos de tarjeta
  payment_provider text, external_customer_id text, external_subscription_id text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.subscriptions is 'Lo que la empresa te paga a TI. No confundir con los pagos que ellas reciben de sus clientes.';
create unique index if not exists subscriptions_one_active
  on public.subscriptions(company_id) where status in ('prueba','activa','morosa','pausada');

create table if not exists public.company_domains (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  domain text not null unique,
  kind   public.domain_kind   not null default 'subdominio',
  status public.domain_status not null default 'pendiente',
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists plan_modules_module_idx     on public.plan_modules(module_id);
create index if not exists subscriptions_company_idx   on public.subscriptions(company_id);
create index if not exists subscriptions_plan_idx      on public.subscriptions(plan_id);
create index if not exists subscriptions_status_idx    on public.subscriptions(status);
create index if not exists company_domains_company_idx on public.company_domains(company_id);

drop trigger if exists subscriptions_touch on public.subscriptions;
create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function public.touch_updated_at();

-- ---------- La regla comercial ----------
create or replace function public.company_module_allowed(p_company uuid, p_module text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select p_module = 'core' or exists (
    select 1 from public.company_modules cm
    join public.modules m on m.id = cm.module_id and m.slug = p_module
    join public.subscriptions s on s.company_id = cm.company_id
                               and s.status in ('prueba','activa','morosa')
    join public.plan_modules pm on pm.plan_id = s.plan_id and pm.module_id = m.id
    where cm.company_id = p_company and cm.enabled);
$$;
revoke execute on function public.company_module_allowed(uuid,text) from public, anon;
grant  execute on function public.company_module_allowed(uuid,text) to authenticated;

-- Qué le falta a una empresa para usar cada módulo (para la pantalla de venta)
create or replace function public.company_plan_state(p_company uuid)
returns table(modulo text, encendido boolean, en_el_plan boolean, disponible boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  select m.slug, coalesce(cm.enabled,false),
         exists (select 1 from public.subscriptions s
                 join public.plan_modules pm on pm.plan_id = s.plan_id and pm.module_id = m.id
                 where s.company_id = p_company and s.status in ('prueba','activa','morosa')),
         public.company_module_allowed(p_company, m.slug)
  from public.modules m
  left join public.company_modules cm on cm.module_id = m.id and cm.company_id = p_company
  order by m.sort;
$$;
revoke execute on function public.company_plan_state(uuid) from public, anon;
grant  execute on function public.company_plan_state(uuid) to authenticated;

-- ---------- RLS ----------
alter table public.plans           enable row level security;
alter table public.plan_modules    enable row level security;
alter table public.subscriptions   enable row level security;
alter table public.company_domains enable row level security;

drop policy if exists plans_read on public.plans;
create policy plans_read on public.plans for select to authenticated using (active);
drop policy if exists plans_write on public.plans;
create policy plans_write on public.plans for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
drop policy if exists plan_modules_read on public.plan_modules;
create policy plan_modules_read on public.plan_modules for select to authenticated using (true);
drop policy if exists plan_modules_write on public.plan_modules;
create policy plan_modules_write on public.plan_modules for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- La empresa VE su suscripción; solo la plataforma la modifica.
-- Nadie se sube de plan solo: eso pasa por el cobro.
drop policy if exists subscriptions_read on public.subscriptions;
create policy subscriptions_read on public.subscriptions for select to authenticated
  using (public.is_company_member(company_id) or public.is_platform_admin());
drop policy if exists subscriptions_write on public.subscriptions;
create policy subscriptions_write on public.subscriptions for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists company_domains_read on public.company_domains;
create policy company_domains_read on public.company_domains for select to authenticated
  using (public.is_company_member(company_id) or public.is_platform_admin());
drop policy if exists company_domains_write on public.company_domains;
create policy company_domains_write on public.company_domains for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- ---------- SEMILLA ----------
insert into public.plans (slug, name, description, price_amount, currency, billing_cycle, max_users, trial_days, sort) values
 ('starter','Starter','Una persona empezando. Lo justo para ordenarse.',            29000,'CLP','mensual',  2, 14, 10),
 ('pro','Pro','Un equipo chico con operación real.',                                 69000,'CLP','mensual',  8, 14, 20),
 ('business','Business','Empresa con operación, reparto y control de dinero.',      149000,'CLP','mensual', 25, 14, 30),
 ('enterprise','Enterprise','A medida, con acompañamiento y desarrollos propios.',        0,'CLP','mensual',null, 0, 40)
on conflict (slug) do nothing;

insert into public.plan_modules (plan_id, module_id)
select p.id, m.id from public.plans p join public.modules m on true
where p.slug='starter' and m.slug in ('core','crm','agenda','support') on conflict do nothing;
insert into public.plan_modules (plan_id, module_id)
select p.id, m.id from public.plans p join public.modules m on true
where p.slug='pro' and m.slug in ('core','crm','agenda','support','commerce','finance','creator') on conflict do nothing;
insert into public.plan_modules (plan_id, module_id)
select p.id, m.id from public.plans p join public.modules m on true
where p.slug='business' and m.slug in ('core','crm','agenda','support','commerce','finance','creator','operations','delivery','food','analytics') on conflict do nothing;
insert into public.plan_modules (plan_id, module_id)
select p.id, m.id from public.plans p join public.modules m on true
where p.slug='enterprise' on conflict do nothing;

insert into public.subscriptions (company_id, plan_id, status, price_amount, billing_cycle,
                                  current_period_start, current_period_end, notes)
select c.id, p.id, 'activa', p.price_amount, 'mensual',
       date_trunc('month', now()), date_trunc('month', now()) + interval '1 month',
       'Empresa propia de la plataforma'
from public.companies c join public.plans p on p.slug='enterprise' where c.slug='anima'
on conflict do nothing;

insert into public.subscriptions (company_id, plan_id, status, price_amount, billing_cycle,
                                  current_period_start, current_period_end, notes)
select c.id, p.id, 'activa', p.price_amount, 'mensual',
       date_trunc('month', now()), date_trunc('month', now()) + interval '1 month',
       'Primer cliente. Piloto.'
from public.companies c join public.plans p on p.slug='business' where c.slug='bilagay'
on conflict do nothing;

insert into public.company_domains (company_id, domain, kind, status)
select id, slug||'.anima.cl', 'subdominio', 'pendiente' from public.companies
on conflict (domain) do nothing;
