-- 0071 · Lo que los clientes le pagan a la PLATAFORMA.
--
-- `subscriptions` guarda el compromiso: que plan tiene la empresa y a que precio.
-- Faltaba lo otro: los cobros concretos que se emiten y los pagos que llegan.
-- Implementacion, mensualidades, y lo que venga: el catalogo de conceptos es una
-- tabla, no un enum, para que agregar "soporte por hora" sea una fila y no una
-- migracion.
--
-- Ojo con la direccion del dinero. Estas tablas son lo que la empresa me paga A MI.
-- Las de `payments`/`invoices` son lo que ELLA le cobra a SUS clientes. Son cosas
-- distintas y por eso viven separadas.

-- ---------- Catalogo de conceptos ----------
create table if not exists public.platform_charge_concepts (
  slug        text primary key,
  name        text not null,
  description text,
  recurrente  boolean not null default false,   -- mensualidad si, implementacion no
  active      boolean not null default true,
  sort        int not null default 100
);
comment on table public.platform_charge_concepts is
  'Que se le puede cobrar a un cliente. Abierto: un concepto nuevo es una fila.';

insert into public.platform_charge_concepts (slug, name, description, recurrente, sort) values
  ('implementacion',   'Implementación',      'Puesta en marcha: levantamiento, carga inicial, configuración y capacitación.', false, 10),
  ('mensualidad',      'Mensualidad',         'Uso de la plataforma durante un período.',                                       true,  20),
  ('soporte',          'Soporte',             'Horas de acompañamiento fuera de lo que cubre el plan.',                          false, 30),
  ('desarrollo',       'Desarrollo a medida', 'Funcionalidad construida para ese cliente.',                                      false, 40),
  ('modulo_adicional', 'Módulo adicional',    'Un módulo fuera de los que trae su plan.',                                        true,  50)
on conflict (slug) do nothing;

-- ---------- Los cobros ----------
do $$ begin create type public.charge_status as enum ('pendiente','pagado','anulado');
exception when duplicate_object then null; end $$;

create table if not exists public.platform_charges (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  concept      text not null references public.platform_charge_concepts(slug),
  description  text,
  -- Para las recurrentes: que periodo cubre este cobro.
  period_start date,
  period_end   date,
  amount       bigint not null check (amount >= 0),
  currency     text   not null default 'CLP',
  issued_at    date   not null default current_date,
  due_date     date,
  status       public.charge_status not null default 'pendiente',
  notes        text,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists platform_charges_company_idx on public.platform_charges(company_id, issued_at desc);
create index if not exists platform_charges_status_idx  on public.platform_charges(status) where status = 'pendiente';

-- ---------- Los pagos ----------
-- Un cobro se puede pagar en partes, asi que los pagos son filas aparte.
create table if not exists public.platform_payments (
  id         uuid primary key default gen_random_uuid(),
  charge_id  uuid not null references public.platform_charges(id) on delete cascade,
  amount     bigint not null check (amount > 0),
  paid_at    date not null default current_date,
  method     text,
  reference  text,
  notes      text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists platform_payments_charge_idx on public.platform_payments(charge_id);

-- El estado del cobro lo decide lo pagado, no se escribe a mano.
create or replace function public.trg_platform_charge_status()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $fn$
declare v_charge uuid; v_pagado bigint; v_monto bigint;
begin
  v_charge := coalesce(new.charge_id, old.charge_id);
  select coalesce(sum(amount),0) into v_pagado from public.platform_payments where charge_id = v_charge;
  select amount into v_monto from public.platform_charges where id = v_charge;
  update public.platform_charges
     set status = case when v_pagado >= v_monto and v_monto > 0 then 'pagado' else 'pendiente' end,
         updated_at = now()
   where id = v_charge and status <> 'anulado'
     and status is distinct from (case when v_pagado >= v_monto and v_monto > 0 then 'pagado' else 'pendiente' end);
  return coalesce(new, old);
end $fn$;
revoke execute on function public.trg_platform_charge_status() from public, anon, authenticated;

drop trigger if exists platform_payments_status on public.platform_payments;
create trigger platform_payments_status
  after insert or update or delete on public.platform_payments
  for each row execute function public.trg_platform_charge_status();

drop trigger if exists platform_charges_touch on public.platform_charges;
create trigger platform_charges_touch before update on public.platform_charges
  for each row execute function public.touch_updated_at();

-- ---------- RLS ----------
-- Escribe solo la plataforma. El cliente puede LEER lo suyo: es su cuenta.
alter table public.platform_charge_concepts enable row level security;
alter table public.platform_charges         enable row level security;
alter table public.platform_payments        enable row level security;

drop policy if exists pcc_read on public.platform_charge_concepts;
create policy pcc_read on public.platform_charge_concepts for select to authenticated using (active);
drop policy if exists pcc_write on public.platform_charge_concepts;
create policy pcc_write on public.platform_charge_concepts for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists platform_charges_read on public.platform_charges;
create policy platform_charges_read on public.platform_charges for select to authenticated
  using (public.is_platform_admin() or public.has_company_level(company_id, 80));
drop policy if exists platform_charges_write on public.platform_charges;
create policy platform_charges_write on public.platform_charges for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists platform_payments_read on public.platform_payments;
create policy platform_payments_read on public.platform_payments for select to authenticated
  using (public.is_platform_admin() or exists (
    select 1 from public.platform_charges c
     where c.id = charge_id and public.has_company_level(c.company_id, 80)));
drop policy if exists platform_payments_write on public.platform_payments;
create policy platform_payments_write on public.platform_payments for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- ---------- La vista de la consola ----------
create or replace view public.v_cartera_plataforma
with (security_invoker = on) as
select c.id as company_id, c.name as empresa, c.slug, c.status as estado_empresa,
       pl.name as linea, p.name as plan, s.status as suscripcion,
       s.price_amount as mensualidad,
       coalesce(ch.cobrado, 0)  as total_cobrado,
       coalesce(ch.pagado, 0)   as total_pagado,
       coalesce(ch.cobrado, 0) - coalesce(ch.pagado, 0) as saldo,
       ch.vencidos
from public.companies c
left join public.product_lines pl on pl.id = c.product_line_id
left join public.subscriptions s  on s.company_id = c.id
left join public.plans p          on p.id = s.plan_id
left join lateral (
  select sum(x.amount) as cobrado,
         sum(coalesce((select sum(pp.amount) from public.platform_payments pp where pp.charge_id = x.id),0)) as pagado,
         count(*) filter (where x.status = 'pendiente' and x.due_date < current_date) as vencidos
  from public.platform_charges x
  where x.company_id = c.id and x.status <> 'anulado'
) ch on true;
