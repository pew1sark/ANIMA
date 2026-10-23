-- =====================================================================
-- 0148 · TikTok (ANIMA STUDIO → Taller → TikTok)
--
-- Vigila los anuncios de TikTok igual que el panel de Anuncios vigila
-- los de Meta (0137), y trae lo que la gente le dice al anuncio:
-- comentarios (para responderlos u ocultarlos desde STUDIO) y
-- formularios instantáneos (entran al Centro de clientes como una
-- solicitud más, source = 'tiktok').
--
--   tiktok_ads_connections  qué cuenta publicitaria (advertiser_id)
--                           alimenta a qué Alma + estado de cada parte
--                           de la sincronización
--   tiktok_ads_objects      campañas, grupos y anuncios (estado real,
--                           revisión, presupuesto, público, creativo)
--   tiktok_ads_daily        métricas por anuncio y por día
--   tiktok_ad_comments      comentarios de los anuncios y respuestas
--   tiktok_oauth_states     el «state» del ingreso con TikTok (10 min);
--                           nadie lo lee salvo la función
--   cron tiktok-hora        la Edge Function `tiktok-ads` sincroniza
--                           cada hora
--
-- El token (Marketing API, no vence salvo que se revoque) vive en Vault
-- como tiktok_token_<alma>, con tt_secret_*: mismo patrón que
-- meta_secret_* (0134) y shop_secret_* (0147), solo nombres «tiktok_».
-- El Alma solo LEE estas tablas; escribe la función con service_role.
-- =====================================================================

create table if not exists public.tiktok_ads_connections (
  alma_id          uuid primary key references public.almas(id) on delete cascade,
  advertiser_id    text not null,
  advertiser_name  text,
  currency         text,
  timezone         text,
  connected_at     timestamptz not null default now(),
  last_sync_at     timestamptz,
  last_sync_ok     boolean,
  last_sync_msg    text,
  -- Comentarios y formularios dependen de permisos aparte en la app de
  -- TikTok: si fallan, los anuncios se siguen viendo y aquí se dice por qué.
  comments_ok      boolean,
  comments_msg     text,
  leads_ok         boolean,
  leads_msg        text,
  lead_tasks       jsonb not null default '{}'::jsonb   -- {page_id: {task_id, at}} descargas pendientes
);

create table if not exists public.tiktok_ads_objects (
  alma_id          uuid not null references public.almas(id) on delete cascade,
  object_id        text not null,
  level            text not null check (level in ('campaign','adgroup','ad')),
  campaign_id      text,
  adgroup_id       text,
  name             text,
  operation_status text,                   -- lo que eligió la persona (ENABLE, DISABLE)
  secondary_status text,                   -- lo que de verdad pasa (…_DELIVERY_OK, …_NOT_APPROVE…)
  objective        text,
  optimization_goal text,
  promotion_type   text,
  budget           numeric,                -- en la moneda de la cuenta
  budget_mode      text,                   -- BUDGET_MODE_DAY, BUDGET_MODE_TOTAL…
  start_time       timestamptz,
  stop_time        timestamptz,
  created_time     timestamptz,
  targeting        jsonb,                  -- resumen del público (grupos)
  creative         jsonb,                  -- {text,cover_url,video_id,cta,landing,item_id,identity_id,identity_type,page_id}
  review           jsonb,                  -- motivos de rechazo
  updated_at       timestamptz not null default now(),
  primary key (alma_id, object_id)
);
create index if not exists tiktok_ads_objects_level on public.tiktok_ads_objects (alma_id, level);

create table if not exists public.tiktok_ads_daily (
  alma_id          uuid not null references public.almas(id) on delete cascade,
  ad_id            text not null,
  day              date not null,          -- día en la zona horaria de la cuenta
  campaign_id      text,
  adgroup_id       text,
  spend            numeric not null default 0,
  impressions      bigint  not null default 0,
  reach            bigint  not null default 0,
  clicks           bigint  not null default 0,   -- clics en el destino
  conversions      bigint  not null default 0,
  results          bigint  not null default 0,   -- lo que optimiza el grupo (formularios, mensajes, visitas…)
  landing_views    bigint  not null default 0,
  video_plays      bigint  not null default 0,
  video_2s         bigint  not null default 0,
  video_6s         bigint  not null default 0,
  video_p25        bigint  not null default 0,
  video_p50        bigint  not null default 0,
  video_p75        bigint  not null default 0,
  video_p100       bigint  not null default 0,
  likes            bigint  not null default 0,
  comments         bigint  not null default 0,
  shares           bigint  not null default 0,
  follows          bigint  not null default 0,
  profile_visits   bigint  not null default 0,
  updated_at       timestamptz not null default now(),
  primary key (alma_id, ad_id, day)
);
create index if not exists tiktok_ads_daily_dia on public.tiktok_ads_daily (alma_id, day desc);

create table if not exists public.tiktok_ad_comments (
  alma_id          uuid not null references public.almas(id) on delete cascade,
  comment_id       text not null,
  ad_id            text,
  adgroup_id       text,
  campaign_id      text,
  item_id          text,                   -- video de TikTok (para responder)
  parent_id        text,                   -- si es respuesta, a qué comentario
  kind             text,                   -- COMMENT | REPLY
  user_name        text,
  text             text,
  likes            integer not null default 0,
  replies          integer not null default 0,
  hidden           boolean not null default false,
  pinned           boolean not null default false,
  mine             boolean not null default false,   -- lo escribió la cuenta (respuesta propia)
  commented_at     timestamptz,
  answered_at      timestamptz,            -- cuándo se respondió desde STUDIO
  done_at          timestamptz,            -- marcado como atendido sin responder
  raw              jsonb,
  synced_at        timestamptz not null default now(),
  primary key (alma_id, comment_id)
);
create index if not exists tiktok_ad_comments_fecha on public.tiktok_ad_comments (alma_id, commented_at desc);

create table if not exists public.tiktok_oauth_states (
  alma_id          uuid primary key references public.almas(id) on delete cascade,
  state            text not null,
  created_at       timestamptz not null default now()
);

alter table public.tiktok_ads_connections enable row level security;
alter table public.tiktok_ads_objects     enable row level security;
alter table public.tiktok_ads_daily       enable row level security;
alter table public.tiktok_ad_comments     enable row level security;
alter table public.tiktok_oauth_states    enable row level security;   -- sin políticas: solo service_role

drop policy if exists tiktok_ads_connections_read on public.tiktok_ads_connections;
create policy tiktok_ads_connections_read on public.tiktok_ads_connections
  for select to authenticated using ((select public.owns_alma(alma_id)));
drop policy if exists tiktok_ads_objects_read on public.tiktok_ads_objects;
create policy tiktok_ads_objects_read on public.tiktok_ads_objects
  for select to authenticated using ((select public.owns_alma(alma_id)));
drop policy if exists tiktok_ads_daily_read on public.tiktok_ads_daily;
create policy tiktok_ads_daily_read on public.tiktok_ads_daily
  for select to authenticated using ((select public.owns_alma(alma_id)));
drop policy if exists tiktok_ad_comments_read on public.tiktok_ad_comments;
create policy tiktok_ad_comments_read on public.tiktok_ad_comments
  for select to authenticated using ((select public.owns_alma(alma_id)));

comment on table public.tiktok_ads_daily is
  'TikTok de STUDIO: métricas por anuncio y día. RLS: solo el dueño del Alma lee; escribe la Edge Function tiktok-ads.';
comment on table public.tiktok_ad_comments is
  'TikTok de STUDIO: comentarios de los anuncios. RLS: solo el dueño del Alma lee; responder/ocultar pasa por la Edge Function tiktok-ads.';

-- ---------------------------------------------------------------------
-- Los formularios de TikTok entran al Centro de clientes como los de Meta.
-- (Se amplía la lista de orígenes; la política de client_leads no cambia.)
-- ---------------------------------------------------------------------
alter table public.client_leads drop constraint if exists client_leads_source_check;
alter table public.client_leads add constraint client_leads_source_check
  check (source in ('meta','csv','manual','tiktok'));

-- ---------------------------------------------------------------------
-- Secretos en Vault. Solo nombres «tiktok_», solo service_role.
-- ---------------------------------------------------------------------
create or replace function public.tt_secret_set(p_name text, p_value text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if p_name is null or p_name not like 'tiktok\_%' then
    raise exception 'Nombre de secreto no permitido';
  end if;
  select id into v_id from vault.secrets where name = p_name;
  if v_id is null then
    perform vault.create_secret(p_value, p_name, 'ANIMA · TikTok');
  else
    perform vault.update_secret(v_id, p_value);
  end if;
end;
$$;

create or replace function public.tt_secret_get(p_name text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets
  where name = p_name and p_name like 'tiktok\_%'
  limit 1;
$$;

create or replace function public.tt_secret_forget(p_name text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from vault.secrets where name = p_name and p_name like 'tiktok\_%';
$$;

revoke all on function public.tt_secret_set(text, text) from public, anon, authenticated;
revoke all on function public.tt_secret_get(text)       from public, anon, authenticated;
revoke all on function public.tt_secret_forget(text)    from public, anon, authenticated;
grant execute on function public.tt_secret_set(text, text) to service_role;
grant execute on function public.tt_secret_get(text)       to service_role;
grant execute on function public.tt_secret_forget(text)    to service_role;

-- ---------------------------------------------------------------------
-- Sincronización cada hora (la función responde al tiro si nadie conectó).
-- Usa la misma llave de cron que meta-leads, meta-ads y tienda-shopify.
-- ---------------------------------------------------------------------
do $$ begin
  if exists (select 1 from cron.job where jobname = 'tiktok-hora') then
    perform cron.unschedule('tiktok-hora');
  end if;
end $$;

select cron.schedule(
  'tiktok-hora',
  '37 * * * *',
  $cron$
    select net.http_post(
      url     := 'https://jwxeowowuxmijuexdrua.supabase.co/functions/v1/tiktok-ads',
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'x-cron-key',   public.meta_secret_get('meta_leads_cron_key')),
      body    := '{"action":"cron"}'::jsonb,
      timeout_milliseconds := 120000
    );
  $cron$
);
