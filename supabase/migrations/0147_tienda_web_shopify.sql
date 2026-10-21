-- =====================================================================
-- 0147 · Tienda web (ANIMA STUDIO → Taller → Tienda web)
--
-- Monitorea una tienda de Shopify y la cruza con los anuncios de Meta
-- que ya sincroniza el panel de Anuncios (0137): qué gente entra a la
-- tienda desde cada anuncio, qué agrega al carrito, qué compra y cuánto
-- deja cada peso invertido.
--
--   shop_connections      qué tienda alimenta a qué Alma (+ estado de la
--                         última sincronización y qué campañas de Meta
--                         son de la tienda)
--   shop_orders           pedidos con el recorrido de quien compró
--                         (primera y última visita, UTM, referente)
--   shop_sessions_daily   visitas por día y por origen (ShopifyQL): de
--                         dónde entran, cuántos llegan al carrito y al pago
--   shop_products         productos activos con su stock
--   cron shopify-hora     la Edge Function `tienda-shopify` sincroniza
--                         cada hora
--
-- Credenciales de la app de Shopify en Vault (shopify_app_<alma>,
-- shopify_token_<alma>) con shop_secret_*: mismo patrón que meta_secret_*
-- de 0134, pero solo nombres «shopify_».
-- El Alma solo LEE estas tablas; escribe la función con service_role.
-- =====================================================================

create table if not exists public.shop_connections (
  alma_id           uuid primary key references public.almas(id) on delete cascade,
  shop_domain       text not null check (shop_domain ~ '^[a-z0-9][a-z0-9-]*\.myshopify\.com$'),
  shop_name         text,
  primary_host      text,                  -- el dominio que ve la gente (tienda.cl)
  currency          text,
  timezone          text,
  plan              text,
  auth_mode         text not null default 'app' check (auth_mode in ('app','token')),
  scopes            text,                  -- permisos que de verdad concedió la app
  -- Campañas de Meta que llevan a la tienda. null = se detectan solas
  -- (objetivo Ventas/Tráfico o UTM que apunta a un anuncio de la cuenta).
  meta_campaign_ids text[],
  connected_at      timestamptz not null default now(),
  last_sync_at      timestamptz,
  last_sync_ok      boolean,
  last_sync_msg     text,
  sessions_ok       boolean,               -- ¿respondió ShopifyQL (permiso read_reports)?
  sessions_msg      text
);

create table if not exists public.shop_orders (
  alma_id             uuid not null references public.almas(id) on delete cascade,
  order_id            text not null,       -- id numérico de Shopify
  name                text,                -- #1001
  created_at          timestamptz not null,
  processed_at        timestamptz,
  updated_at          timestamptz,
  cancelled_at        timestamptz,
  source_name         text,                -- web, pos, shopify_draft_order…
  financial_status    text,                -- PAID, PENDING, REFUNDED…
  fulfillment_status  text,                -- UNFULFILLED, FULFILLED…
  return_status       text,
  total               numeric not null default 0,   -- total actual (después de devoluciones), moneda de la tienda
  subtotal            numeric not null default 0,
  discounts           numeric not null default 0,
  shipping            numeric not null default 0,
  refunded            numeric not null default 0,
  currency            text,
  items               integer not null default 0,
  customer_id         text,
  customer_name       text,
  customer_orders     integer,             -- pedidos que lleva esa persona en la tienda
  customer_order_index integer,            -- 1 = primera compra
  city                text,
  region              text,
  country             text,
  journey_ready       boolean,
  days_to_conversion  integer,
  moments             integer,
  first_visit         jsonb,               -- {at,source,type,referrer,landing,utm:{source,medium,campaign,content,term}}
  last_visit          jsonb,
  lines               jsonb,               -- [{p:product_id,t,v,q,a}]
  synced_at           timestamptz not null default now(),
  primary key (alma_id, order_id)
);
create index if not exists shop_orders_alma_fecha on public.shop_orders (alma_id, created_at desc);

create table if not exists public.shop_sessions_daily (
  alma_id          uuid not null references public.almas(id) on delete cascade,
  day              date not null,          -- día en la zona horaria de la tienda
  referrer_source  text not null default '',
  referrer_name    text not null default '',
  utm_source       text not null default '',
  utm_medium       text not null default '',
  utm_campaign     text not null default '',
  utm_content      text not null default '',
  utm_term         text not null default '',
  sessions         integer not null default 0,
  visitors         integer not null default 0,
  carts            integer not null default 0,   -- visitas que agregaron al carrito
  checkouts        integer not null default 0,   -- visitas que llegaron al pago
  completed        integer not null default 0,   -- visitas que compraron
  updated_at       timestamptz not null default now(),
  primary key (alma_id, day, referrer_source, referrer_name, utm_source, utm_medium, utm_campaign, utm_content, utm_term)
);
create index if not exists shop_sessions_alma_dia on public.shop_sessions_daily (alma_id, day desc);

create table if not exists public.shop_products (
  alma_id          uuid not null references public.almas(id) on delete cascade,
  product_id       text not null,
  title            text,
  handle           text,
  status           text,
  inventory        integer,
  tracks_inventory boolean,
  url              text,
  image_url        text,
  price_min        numeric,
  price_max        numeric,
  updated_at       timestamptz,
  synced_at        timestamptz not null default now(),
  primary key (alma_id, product_id)
);

alter table public.shop_connections    enable row level security;
alter table public.shop_orders         enable row level security;
alter table public.shop_sessions_daily enable row level security;
alter table public.shop_products       enable row level security;

drop policy if exists shop_connections_read on public.shop_connections;
create policy shop_connections_read on public.shop_connections
  for select to authenticated using ((select public.owns_alma(alma_id)));
drop policy if exists shop_orders_read on public.shop_orders;
create policy shop_orders_read on public.shop_orders
  for select to authenticated using ((select public.owns_alma(alma_id)));
drop policy if exists shop_sessions_daily_read on public.shop_sessions_daily;
create policy shop_sessions_daily_read on public.shop_sessions_daily
  for select to authenticated using ((select public.owns_alma(alma_id)));
drop policy if exists shop_products_read on public.shop_products;
create policy shop_products_read on public.shop_products
  for select to authenticated using ((select public.owns_alma(alma_id)));

comment on table public.shop_orders is
  'Tienda web de STUDIO: pedidos de Shopify con el recorrido de quien compró. RLS: solo el dueño del Alma lee; escribe la Edge Function tienda-shopify.';
comment on table public.shop_sessions_daily is
  'Tienda web de STUDIO: visitas por día y origen (ShopifyQL). RLS: solo el dueño del Alma lee; escribe la Edge Function tienda-shopify.';

-- ---------------------------------------------------------------------
-- Secretos en Vault. Solo nombres «shopify_», solo service_role.
-- ---------------------------------------------------------------------
create or replace function public.shop_secret_set(p_name text, p_value text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if p_name is null or p_name not like 'shopify\_%' then
    raise exception 'Nombre de secreto no permitido';
  end if;
  select id into v_id from vault.secrets where name = p_name;
  if v_id is null then
    perform vault.create_secret(p_value, p_name, 'ANIMA · Tienda web (Shopify)');
  else
    perform vault.update_secret(v_id, p_value);
  end if;
end;
$$;

create or replace function public.shop_secret_get(p_name text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets
  where name = p_name and p_name like 'shopify\_%'
  limit 1;
$$;

create or replace function public.shop_secret_forget(p_name text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from vault.secrets where name = p_name and p_name like 'shopify\_%';
$$;

revoke all on function public.shop_secret_set(text, text) from public, anon, authenticated;
revoke all on function public.shop_secret_get(text)       from public, anon, authenticated;
revoke all on function public.shop_secret_forget(text)    from public, anon, authenticated;
grant execute on function public.shop_secret_set(text, text) to service_role;
grant execute on function public.shop_secret_get(text)       to service_role;
grant execute on function public.shop_secret_forget(text)    to service_role;

-- ---------------------------------------------------------------------
-- Sincronización cada hora (la función responde al tiro si nadie conectó).
-- Usa la misma llave de cron que meta-leads y meta-ads.
-- ---------------------------------------------------------------------
do $$ begin
  if exists (select 1 from cron.job where jobname = 'shopify-hora') then
    perform cron.unschedule('shopify-hora');
  end if;
end $$;

select cron.schedule(
  'shopify-hora',
  '27 * * * *',
  $cron$
    select net.http_post(
      url     := 'https://jwxeowowuxmijuexdrua.supabase.co/functions/v1/tienda-shopify',
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'x-cron-key',   public.meta_secret_get('meta_leads_cron_key')),
      body    := '{"action":"cron"}'::jsonb,
      timeout_milliseconds := 60000
    );
  $cron$
);
