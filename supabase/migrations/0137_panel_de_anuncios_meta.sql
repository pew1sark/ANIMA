-- =====================================================================
-- 0137 · Panel de anuncios (ANIMA STUDIO → Taller → Anuncios)
--
-- Trae de la API de Marketing de Meta todo lo que hace falta para
-- analizar y vigilar cada anuncio, y lo cruza con lo que pasa después
-- dentro de ANIMA (solicitudes → cotizaciones → trabajos ganados).
--
--   meta_ads_connections   qué cuenta publicitaria alimenta a qué Alma
--   meta_ads_objects       campañas, conjuntos y anuncios (estado,
--                          presupuesto, objetivo, creativo)
--   meta_ads_daily         métricas por anuncio y por día (una fila por
--                          anuncio y fecha; se re-escriben los últimos
--                          días porque Meta corrige la atribución)
--   cron meta-ads-hora     la Edge Function `meta-ads` sincroniza cada hora
--
-- El token de la persona (ads_read / ads_management) vive en Vault como
-- meta_ads_token_<alma>, con las mismas funciones meta_secret_* de 0134.
-- El Alma solo LEE estas tablas; escribe la función con service_role.
-- =====================================================================

create table if not exists public.meta_ads_connections (
  alma_id          uuid primary key references public.almas(id) on delete cascade,
  ad_account_id    text not null,          -- sin el prefijo act_
  account_name     text,
  currency         text,
  timezone         text,
  connected_at     timestamptz not null default now(),
  token_expires_at timestamptz,            -- null = no vence / no se sabe
  last_sync_at     timestamptz,
  last_sync_ok     boolean,
  last_sync_msg    text
);

create table if not exists public.meta_ads_objects (
  alma_id          uuid not null references public.almas(id) on delete cascade,
  object_id        text not null,
  level            text not null check (level in ('campaign','adset','ad')),
  campaign_id      text,
  adset_id         text,
  name             text,
  status           text,                   -- lo que eligió la persona (ACTIVE, PAUSED…)
  effective_status text,                   -- lo que de verdad pasa (IN_PROCESS, DISAPPROVED…)
  objective        text,
  optimization_goal text,
  daily_budget     numeric,                -- en la moneda de la cuenta (ya dividido por 100)
  lifetime_budget  numeric,
  start_time       timestamptz,
  stop_time        timestamptz,
  created_time     timestamptz,
  targeting        jsonb,                  -- resumen del público (conjuntos)
  creative         jsonb,                  -- {thumbnail_url,image_url,title,body,cta,video_id,link}
  issues           jsonb,                  -- rechazos / problemas de entrega
  updated_at       timestamptz not null default now(),
  primary key (alma_id, object_id)
);
create index if not exists meta_ads_objects_level on public.meta_ads_objects (alma_id, level);

create table if not exists public.meta_ads_daily (
  alma_id          uuid not null references public.almas(id) on delete cascade,
  ad_id            text not null,
  day              date not null,
  campaign_id      text,
  adset_id         text,
  spend            numeric not null default 0,
  impressions      bigint  not null default 0,
  reach            bigint  not null default 0,
  frequency        numeric,
  clicks           bigint  not null default 0,   -- todos los clics
  link_clicks      bigint  not null default 0,   -- clics en el enlace / botón
  landing_views    bigint  not null default 0,
  leads            bigint  not null default 0,   -- formularios enviados según Meta
  messages         bigint  not null default 0,   -- conversaciones iniciadas
  engagement       bigint  not null default 0,   -- interacciones con la publicación
  video_3s         bigint  not null default 0,   -- reproducciones de 3 s
  thruplays        bigint  not null default 0,
  video_p25        bigint  not null default 0,
  video_p50        bigint  not null default 0,
  video_p75        bigint  not null default 0,
  video_p100       bigint  not null default 0,
  actions          jsonb,                        -- todo lo demás tal cual lo manda Meta
  updated_at       timestamptz not null default now(),
  primary key (alma_id, ad_id, day)
);
create index if not exists meta_ads_daily_alma_day on public.meta_ads_daily (alma_id, day desc);

alter table public.meta_ads_connections enable row level security;
alter table public.meta_ads_objects     enable row level security;
alter table public.meta_ads_daily       enable row level security;

drop policy if exists meta_ads_connections_read on public.meta_ads_connections;
create policy meta_ads_connections_read on public.meta_ads_connections
  for select to authenticated using ((select public.owns_alma(alma_id)));
drop policy if exists meta_ads_objects_read on public.meta_ads_objects;
create policy meta_ads_objects_read on public.meta_ads_objects
  for select to authenticated using ((select public.owns_alma(alma_id)));
drop policy if exists meta_ads_daily_read on public.meta_ads_daily;
create policy meta_ads_daily_read on public.meta_ads_daily
  for select to authenticated using ((select public.owns_alma(alma_id)));

comment on table public.meta_ads_daily is
  'Panel de anuncios de STUDIO: métricas diarias por anuncio desde la API de Marketing de Meta. RLS: solo el dueño del Alma lee; escribe la Edge Function meta-ads.';

-- Sincronización cada hora (la función responde al tiro si nadie conectó).
-- Usa la misma llave de cron que meta-leads.
do $$ begin
  if exists (select 1 from cron.job where jobname = 'meta-ads-hora') then
    perform cron.unschedule('meta-ads-hora');
  end if;
end $$;

select cron.schedule(
  'meta-ads-hora',
  '17 * * * *',
  $cron$
    select net.http_post(
      url     := 'https://jwxeowowuxmijuexdrua.supabase.co/functions/v1/meta-ads',
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'x-cron-key',   public.meta_secret_get('meta_leads_cron_key')),
      body    := '{"action":"cron"}'::jsonb,
      timeout_milliseconds := 60000
    );
  $cron$
);
