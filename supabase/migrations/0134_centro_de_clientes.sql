-- =====================================================================
-- 0134 · Centro de clientes (ANIMA STUDIO)
--
-- Las solicitudes que llegan de los formularios de Meta (anuncios de
-- clientes potenciales) entran solas a STUDIO → Taller → Centro de clientes.
-- Ahí el Alma lee cada solicitud, la confirma y abre WhatsApp con un
-- mensaje ya escrito.
--
--   client_leads            una fila por solicitud (Meta, CSV o manual)
--   meta_lead_connections   qué página de Facebook alimenta a qué Alma
--   meta_secret_*           el token de la página vive cifrado en Vault;
--                           solo la Edge Function (service_role) lo lee
--   cron meta-leads-5min    trae lo nuevo cada 5 minutos aunque no haya
--                           webhook configurado
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1 · Solicitudes
-- ---------------------------------------------------------------------
create table if not exists public.client_leads (
  id               uuid primary key default gen_random_uuid(),
  alma_id          uuid not null references public.almas(id) on delete cascade,
  source           text not null default 'meta' check (source in ('meta','csv','manual')),
  external_id      text,                 -- id del lead en Meta (sin el prefijo "l:")
  page_id          text,
  form_id          text,
  form_name        text,
  ad_id            text,
  ad_name          text,
  campaign_name    text,
  platform         text,                 -- fb | ig
  full_name        text,
  phone            text,
  email            text,
  city             text,                 -- ciudad y comuna del muro
  measures         text,                 -- medidas aproximadas
  idea             text,                 -- idea del diseño
  photos_via       text,                 -- cómo prefiere mandar las fotos
  answers          jsonb not null default '[]'::jsonb,   -- [{key,label,value}] tal cual llegó
  status           text not null default 'nuevo'
                   check (status in ('nuevo','revisado','contactado','descartado')),
  lead_created_at  timestamptz not null default now(),
  reviewed_at      timestamptz,
  contacted_at     timestamptz,
  message          text,                 -- último mensaje de confirmación enviado
  client_id        uuid references public.clients(id) on delete set null,
  notes            text,
  created_at       timestamptz not null default now(),
  -- Un mismo lead no entra dos veces, venga por la API o por el CSV.
  -- (NULL no choca: las solicitudes manuales no llevan external_id.)
  constraint client_leads_unico unique (alma_id, external_id)
);

create index if not exists client_leads_alma_fecha on public.client_leads (alma_id, lead_created_at desc);
create index if not exists client_leads_client     on public.client_leads (client_id) where client_id is not null;

alter table public.client_leads enable row level security;

drop policy if exists client_leads_own on public.client_leads;
create policy client_leads_own on public.client_leads
  for all to authenticated
  using ((select public.owns_alma(alma_id)))
  with check ((select public.owns_alma(alma_id)));

comment on table public.client_leads is
  'Centro de clientes de STUDIO: solicitudes de formularios de Meta (y CSV/manuales). RLS: solo el dueño del Alma.';

-- En directo: STUDIO escucha los INSERT para avisar al instante.
do $$ begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'client_leads') then
    alter publication supabase_realtime add table public.client_leads;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2 · Conexión con la página de Facebook
-- ---------------------------------------------------------------------
create table if not exists public.meta_lead_connections (
  alma_id          uuid primary key references public.almas(id) on delete cascade,
  page_id          text not null unique,
  page_name        text,
  connected_at     timestamptz not null default now(),
  last_sync_at     timestamptz,
  last_sync_ok     boolean,
  last_sync_msg    text,
  last_lead_time   bigint,              -- unix del lead más reciente visto
  leads_imported   integer not null default 0
);

alter table public.meta_lead_connections enable row level security;

-- El Alma ve el estado de su conexión. Escribir solo lo hace la Edge
-- Function con service_role (que se salta RLS): no hay políticas de escritura.
drop policy if exists meta_lead_connections_read on public.meta_lead_connections;
create policy meta_lead_connections_read on public.meta_lead_connections
  for select to authenticated
  using ((select public.owns_alma(alma_id)));

-- ---------------------------------------------------------------------
-- 3 · Secretos en Vault (token de página, llaves del cron y del webhook)
--     Mismo patrón que Bsale: nunca en una tabla legible ni en el navegador.
--     Solo nombres que empiezan con "meta_", solo service_role.
-- ---------------------------------------------------------------------
create or replace function public.meta_secret_set(p_name text, p_value text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if p_name is null or p_name not like 'meta\_%' then
    raise exception 'Nombre de secreto no permitido';
  end if;
  select id into v_id from vault.secrets where name = p_name;
  if v_id is null then
    perform vault.create_secret(p_value, p_name, 'ANIMA · Centro de clientes (Meta)');
  else
    perform vault.update_secret(v_id, p_value);
  end if;
end;
$$;

create or replace function public.meta_secret_get(p_name text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets
  where name = p_name and p_name like 'meta\_%'
  limit 1;
$$;

create or replace function public.meta_secret_forget(p_name text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from vault.secrets where name = p_name and p_name like 'meta\_%';
$$;

revoke all on function public.meta_secret_set(text, text) from public, anon, authenticated;
revoke all on function public.meta_secret_get(text)       from public, anon, authenticated;
revoke all on function public.meta_secret_forget(text)    from public, anon, authenticated;
grant execute on function public.meta_secret_set(text, text) to service_role;
grant execute on function public.meta_secret_get(text)       to service_role;
grant execute on function public.meta_secret_forget(text)    to service_role;

-- Llaves generadas aquí (no son credenciales de nadie): el cron se presenta
-- con la primera; el webhook de Meta se verifica con la segunda.
do $$ begin
  if public.meta_secret_get('meta_leads_cron_key') is null then
    perform public.meta_secret_set('meta_leads_cron_key', encode(extensions.gen_random_bytes(24), 'hex'));
  end if;
  if public.meta_secret_get('meta_leads_verify_token') is null then
    perform public.meta_secret_set('meta_leads_verify_token', encode(extensions.gen_random_bytes(16), 'hex'));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 4 · Sincronización automática cada 5 minutos
--     Si no hay ninguna página conectada, la función responde al tiro.
-- ---------------------------------------------------------------------
create extension if not exists pg_net with schema extensions;   -- sus funciones quedan en `net`
create extension if not exists pg_cron;

do $$ begin
  if exists (select 1 from cron.job where jobname = 'meta-leads-5min') then
    perform cron.unschedule('meta-leads-5min');
  end if;
end $$;

select cron.schedule(
  'meta-leads-5min',
  '*/5 * * * *',
  $cron$
    select net.http_post(
      url     := 'https://jwxeowowuxmijuexdrua.supabase.co/functions/v1/meta-leads',
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'x-cron-key',   public.meta_secret_get('meta_leads_cron_key')),
      body    := '{"action":"cron"}'::jsonb,
      timeout_milliseconds := 20000
    );
  $cron$
);
