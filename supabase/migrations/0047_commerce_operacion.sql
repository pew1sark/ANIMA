-- 0047 · COMMERCE · el motor operativo (21 tablas)
-- Ventas, preparacion, reparto, cobranza, proceso y mermas.
-- Mismas tres correcciones multiempresa: company_id obligatorio,
-- unicos por empresa y numeracion por empresa.

do $$ begin create type public.customer_type as enum ('particular','restaurante','hotel','supermercado','mayorista','distribuidor','otro');
exception when duplicate_object then null; end $$;
do $$ begin create type public.order_status as enum ('nuevo','confirmado','en_preparacion','preparado','en_reparto','entregado','cancelado');
exception when duplicate_object then null; end $$;
do $$ begin create type public.delivery_status as enum ('pendiente','asignada','en_camino','entregada','fallida');
exception when duplicate_object then null; end $$;
do $$ begin create type public.loss_reason as enum ('merma_proceso','dano','vencimiento','diferencia_peso','robo','devolucion','otro');
exception when duplicate_object then null; end $$;
do $$ begin create type public.app_role as enum ('admin','ventas','compras','inventario','empaque','reparto','finanzas');
exception when duplicate_object then null; end $$;

-- ---------- Rellenos automaticos ----------
-- Deja que una app que aun no conoce company_id siga insertando.
create or replace function public.set_company_current()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.company_id is null then
    select cm.company_id into new.company_id from public.company_members cm
    where cm.user_id = (select auth.uid()) and cm.status = 'active'
    order by cm.created_at asc limit 1;
  end if;
  return new;
end $$;
revoke execute on function public.set_company_current() from public, anon, authenticated;

-- Numeracion por empresa, con el prefijo como argumento del trigger.
create or replace function public.set_code_from_company()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.code is null and new.company_id is not null then
    new.code := public.next_code(new.company_id, TG_ARGV[0]);
  end if;
  return new;
end $$;
revoke execute on function public.set_code_from_company() from public, anon, authenticated;

-- ---------- LISTAS DE PRECIO ----------
create table if not exists public.price_lists (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null, name text not null, description text,
  is_default boolean not null default false,
  status public.entity_status not null default 'activo',
  created_at timestamptz not null default now(),
  unique (company_id, code)
);
create table if not exists public.price_list_items (
  company_id uuid not null references public.companies(id) on delete cascade,
  price_list_id uuid not null references public.price_lists(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  price numeric(12,2) not null,
  updated_at timestamptz not null default now(),
  primary key (price_list_id, product_id)
);

-- ---------- CLIENTES ----------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text, name text not null, company text, rut text,
  customer_type public.customer_type not null default 'particular',
  contact_name text, phone text, whatsapp text, email text,
  address text, comuna text, region text,
  price_list_id uuid references public.price_lists(id) on delete set null,
  credit_limit numeric(14,2) not null default 0,
  payment_terms_days integer not null default 0,
  notes text,
  status public.entity_status not null default 'activo',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  latitude numeric(10,7), longitude numeric(10,7),
  geocoded_at timestamptz, geocode_source text,
  unique (company_id, code)
);
create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  label text not null default 'Principal', address text not null,
  comuna text, region text, reference text,
  latitude numeric(10,7), longitude numeric(10,7),
  contact_name text, contact_phone text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.customer_special_prices (
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  price numeric(12,2) not null, notes text,
  updated_at timestamptz not null default now(),
  primary key (customer_id, product_id)
);

-- ---------- PEDIDOS ----------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text,
  customer_id uuid not null references public.customers(id) on delete restrict,
  address_id uuid references public.customer_addresses(id) on delete set null,
  price_list_id uuid references public.price_lists(id) on delete set null,
  status public.order_status not null default 'nuevo',
  order_date timestamptz not null default now(),
  delivery_date date, delivery_window text,
  subtotal numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  freight  numeric(14,2) not null default 0,
  total    numeric(14,2) not null default 0,
  cost_total numeric(14,2) not null default 0,
  payment_method public.payment_method not null default 'efectivo',
  payment_status public.payment_status not null default 'pendiente',
  amount_paid numeric(14,2) not null default 0,
  due_date date, notes text, cancel_reason text,
  created_by  uuid references public.profiles(id) on delete set null,
  prepared_by uuid references public.profiles(id) on delete set null,
  driver_id   uuid references public.profiles(id) on delete set null,
  confirmed_at timestamptz, prepared_at timestamptz, delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  invoice_number text, invoice_url text,
  invoice_status text not null default 'pendiente',
  invoice_issued_at timestamptz,
  unique (company_id, code)
);
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  lot_id uuid references public.inventory_lots(id) on delete set null,
  quantity_ordered  numeric(12,3) not null,
  quantity_prepared numeric(12,3),
  unit public.unit_measure not null default 'kg',
  unit_price numeric(12,2) not null,
  discount   numeric(12,2) not null default 0,
  unit_cost  numeric(12,2) not null default 0,
  line_total numeric(14,2) generated always as
    (round((coalesce(quantity_prepared, quantity_ordered) * unit_price) - discount, 2)) stored,
  is_reserved boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  gross_weight numeric(12,3), ice_weight numeric(12,3)
);
create table if not exists public.order_status_history (
  id bigint generated by default as identity primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  from_status public.order_status, to_status public.order_status not null,
  changed_by uuid references public.profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

-- ---------- REPARTO ----------
create table if not exists public.routes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text, name text,
  route_date date not null default ((now() at time zone 'America/Santiago'))::date,
  driver_id uuid references public.profiles(id) on delete set null,
  status text not null default 'planificada', notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (company_id, code)
);
create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text,
  order_id uuid not null references public.orders(id) on delete cascade,
  route_id uuid references public.routes(id) on delete set null,
  driver_id uuid references public.profiles(id) on delete set null,
  status public.delivery_status not null default 'pendiente',
  sequence integer, scheduled_date date,
  started_at timestamptz, delivered_at timestamptz,
  received_by_name text,
  latitude numeric(10,7), longitude numeric(10,7),
  signature_url text, photo_url text,
  amount_collected numeric(14,2) not null default 0,
  payment_method public.payment_method,
  failure_reason text, notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);

-- ---------- DINERO ----------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text,
  direction text not null,
  order_id    uuid references public.orders(id)    on delete set null,
  purchase_id uuid references public.purchases(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  amount numeric(14,2) not null,
  method public.payment_method not null default 'efectivo',
  paid_at timestamptz not null default now(),
  reference text, notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  opening_receivable_id uuid, opening_payable_id uuid,
  unique (company_id, code)
);
create table if not exists public.opening_receivables (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text not null, document_number text,
  issued_at date, due_date date,
  amount numeric(14,2) not null, amount_paid numeric(14,2) not null default 0,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (company_id, code)
);
create table if not exists public.opening_payables (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text,
  supplier_id uuid references public.suppliers(id) on delete set null,
  supplier_name text not null, document_number text,
  issued_at date, due_date date,
  amount numeric(14,2) not null, amount_paid numeric(14,2) not null default 0,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (company_id, code)
);

-- ---------- PROCESO Y MERMAS ----------
create table if not exists public.processing_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text,
  source_lot_id     uuid not null references public.inventory_lots(id) on delete restrict,
  source_product_id uuid not null references public.products(id)       on delete restrict,
  input_quantity  numeric(12,3) not null,
  output_quantity numeric(12,3) not null default 0,
  waste_quantity  numeric(12,3) not null default 0,
  yield_pct  numeric(6,2)  not null default 0,
  input_cost numeric(14,2) not null default 0,
  status text not null default 'completado',
  location_id uuid references public.locations(id) on delete set null,
  notes text,
  processed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (company_id, code)
);
create table if not exists public.processing_outputs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  processing_id uuid not null references public.processing_orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  lot_id uuid references public.inventory_lots(id) on delete set null,
  quantity numeric(12,3) not null,
  unit_cost numeric(12,2) not null default 0
);
create table if not exists public.processing_yields (
  company_id uuid not null references public.companies(id) on delete cascade,
  source_product_id uuid not null references public.products(id) on delete cascade,
  output_product_id uuid not null references public.products(id) on delete cascade,
  samples integer not null default 0,
  avg_yield_pct  numeric(6,2) not null default 0,
  last_yield_pct numeric(6,2),
  updated_at timestamptz not null default now(),
  primary key (source_product_id, output_product_id)
);
create table if not exists public.losses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text,
  product_id uuid not null references public.products(id) on delete restrict,
  lot_id uuid references public.inventory_lots(id) on delete set null,
  quantity numeric(12,3) not null,
  unit public.unit_measure not null default 'kg',
  reason public.loss_reason not null default 'merma_proceso',
  cost numeric(14,2) not null default 0,
  order_id uuid references public.orders(id) on delete set null,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (company_id, code)
);
create table if not exists public.stock_reservations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  lot_id   uuid not null references public.inventory_lots(id) on delete cascade,
  quantity numeric(12,3) not null,
  consumed numeric(12,3) not null default 0,
  status text not null default 'activa',
  created_at timestamptz not null default now()
);

-- ---------- SISTEMA DE LA EMPRESA ----------
create table if not exists public.company_config (
  company_id uuid not null references public.companies(id) on delete cascade,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  description text,
  updated_at timestamptz not null default now(),
  primary key (company_id, key)
);
comment on table public.company_config is 'Equivale al settings de JLIZ, ahora por empresa.';

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  target_role public.app_role,
  title text not null, body text,
  kind text not null default 'info', link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.user_invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null, full_name text,
  role public.app_role not null default 'reparto',
  role_id uuid references public.roles(id),
  notes text,
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  used_at timestamptz, used_by uuid references public.profiles(id) on delete set null,
  unique (company_id, email)
);

-- ---------- INDICES ----------
create index if not exists price_lists_company_idx      on public.price_lists(company_id);
create index if not exists price_list_items_company_idx on public.price_list_items(company_id);
create index if not exists price_list_items_product_idx on public.price_list_items(product_id);
create index if not exists customers_company_idx        on public.customers(company_id);
create index if not exists customers_price_list_idx     on public.customers(price_list_id);
create index if not exists customers_created_by_idx     on public.customers(created_by);
create index if not exists cust_addr_company_idx        on public.customer_addresses(company_id);
create index if not exists cust_addr_customer_idx       on public.customer_addresses(customer_id);
create index if not exists cust_sp_company_idx          on public.customer_special_prices(company_id);
create index if not exists cust_sp_product_idx          on public.customer_special_prices(product_id);
create index if not exists orders_company_idx           on public.orders(company_id, order_date desc);
create index if not exists orders_customer_idx          on public.orders(customer_id);
create index if not exists orders_status_idx            on public.orders(company_id, status);
create index if not exists orders_address_idx           on public.orders(address_id);
create index if not exists orders_price_list_idx        on public.orders(price_list_id);
create index if not exists orders_created_by_idx        on public.orders(created_by);
create index if not exists orders_prepared_by_idx       on public.orders(prepared_by);
create index if not exists orders_driver_idx            on public.orders(driver_id);
create index if not exists order_items_company_idx      on public.order_items(company_id);
create index if not exists order_items_order_idx        on public.order_items(order_id);
create index if not exists order_items_product_idx      on public.order_items(product_id);
create index if not exists order_items_lot_idx          on public.order_items(lot_id);
create index if not exists osh_company_idx              on public.order_status_history(company_id);
create index if not exists osh_order_idx                on public.order_status_history(order_id);
create index if not exists osh_changed_by_idx           on public.order_status_history(changed_by);
create index if not exists routes_company_idx           on public.routes(company_id, route_date desc);
create index if not exists routes_driver_idx            on public.routes(driver_id);
create index if not exists routes_created_by_idx        on public.routes(created_by);
create index if not exists deliveries_company_idx       on public.deliveries(company_id);
create index if not exists deliveries_order_idx         on public.deliveries(order_id);
create index if not exists deliveries_route_idx         on public.deliveries(route_id);
create index if not exists deliveries_driver_idx        on public.deliveries(driver_id);
create index if not exists payments_company_idx         on public.payments(company_id, paid_at desc);
create index if not exists payments_order_idx           on public.payments(order_id);
create index if not exists payments_purchase_idx        on public.payments(purchase_id);
create index if not exists payments_customer_idx        on public.payments(customer_id);
create index if not exists payments_supplier_idx        on public.payments(supplier_id);
create index if not exists payments_created_by_idx      on public.payments(created_by);
create index if not exists open_recv_company_idx        on public.opening_receivables(company_id);
create index if not exists open_recv_customer_idx       on public.opening_receivables(customer_id);
create index if not exists open_recv_created_by_idx     on public.opening_receivables(created_by);
create index if not exists open_pay_company_idx         on public.opening_payables(company_id);
create index if not exists open_pay_supplier_idx        on public.opening_payables(supplier_id);
create index if not exists open_pay_created_by_idx      on public.opening_payables(created_by);
create index if not exists proc_orders_company_idx      on public.processing_orders(company_id);
create index if not exists proc_orders_lot_idx          on public.processing_orders(source_lot_id);
create index if not exists proc_orders_product_idx      on public.processing_orders(source_product_id);
create index if not exists proc_orders_location_idx     on public.processing_orders(location_id);
create index if not exists proc_orders_by_idx           on public.processing_orders(processed_by);
create index if not exists proc_out_company_idx         on public.processing_outputs(company_id);
create index if not exists proc_out_processing_idx      on public.processing_outputs(processing_id);
create index if not exists proc_out_product_idx         on public.processing_outputs(product_id);
create index if not exists proc_out_lot_idx             on public.processing_outputs(lot_id);
create index if not exists proc_yields_company_idx      on public.processing_yields(company_id);
create index if not exists proc_yields_output_idx       on public.processing_yields(output_product_id);
create index if not exists losses_company_idx           on public.losses(company_id);
create index if not exists losses_product_idx           on public.losses(product_id);
create index if not exists losses_lot_idx               on public.losses(lot_id);
create index if not exists losses_order_idx             on public.losses(order_id);
create index if not exists losses_created_by_idx        on public.losses(created_by);
create index if not exists stock_res_company_idx        on public.stock_reservations(company_id);
create index if not exists stock_res_item_idx           on public.stock_reservations(order_item_id);
create index if not exists stock_res_order_idx          on public.stock_reservations(order_id);
create index if not exists stock_res_lot_idx            on public.stock_reservations(lot_id);
create index if not exists notifications_company_idx    on public.notifications(company_id, created_at desc);
create index if not exists notifications_user_idx       on public.notifications(user_id);
create index if not exists user_inv_company_idx         on public.user_invitations(company_id);
create index if not exists user_inv_invited_by_idx      on public.user_invitations(invited_by);
create index if not exists user_inv_used_by_idx         on public.user_invitations(used_by);

-- ---------- TRIGGERS: empresa automatica, codigo por empresa, updated_at ----------
do $$
declare t text;
begin
  foreach t in array array['price_lists','price_list_items','customers','customer_addresses',
    'customer_special_prices','orders','order_items','order_status_history','routes','deliveries',
    'payments','opening_receivables','opening_payables','processing_orders','processing_outputs',
    'processing_yields','losses','stock_reservations','company_config','notifications','user_invitations',
    'product_categories','fish_species','products','product_price_history','locations','suppliers',
    'supplier_aliases','supplier_products','inventory_lots','inventory_movements','purchases',
    'purchase_items','purchase_history'] loop
    execute format('drop trigger if exists %I on public.%I', t||'_set_company', t);
    execute format('create trigger %I before insert on public.%I for each row execute function public.set_company_current()',
                   t||'_set_company', t);
  end loop;
end $$;

do $$
declare r record;
begin
  for r in select * from (values ('orders','PED'),('deliveries','ENT'),('routes','RUT'),
    ('payments','PAG'),('opening_receivables','SIC'),('opening_payables','SIP'),
    ('processing_orders','PRO'),('losses','MER')) as v(t,p) loop
    execute format('drop trigger if exists %I on public.%I', r.t||'_code', r.t);
    execute format('create trigger %I before insert on public.%I for each row execute function public.set_code_from_company(%L)',
                   r.t||'_code', r.t, r.p);
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array['customers','orders','deliveries'] loop
    execute format('drop trigger if exists %I on public.%I', t||'_touch2', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()',
                   t||'_touch2', t);
  end loop;
end $$;

-- ---------- RLS ----------
-- Operacion desde empleado (40); dinero desde encargado (60).
do $$
declare t text; lvl int;
begin
  foreach t in array array['price_lists','price_list_items','customers','customer_addresses',
    'customer_special_prices','orders','order_items','order_status_history','routes','deliveries',
    'processing_orders','processing_outputs','processing_yields','losses','stock_reservations',
    'notifications','company_config',
    'payments','opening_receivables','opening_payables','user_invitations'] loop
    lvl := case when t in ('payments','opening_receivables','opening_payables','user_invitations') then 60 else 40 end;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_company', t);
    execute format($p$create policy %I on public.%I for all to authenticated
      using (public.has_company_level(company_id, %s))
      with check (public.has_company_level(company_id, %s))$p$, t||'_company', t, lvl, lvl);
  end loop;
end $$;;