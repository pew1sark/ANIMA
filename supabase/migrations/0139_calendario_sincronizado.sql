-- =====================================================================
-- 0139 · Calendario sincronizado (ANIMA STUDIO → Taller → Calendario)
--
-- Dos sentidos, sin contraseñas de nadie:
--
--   ANIMA → iPhone / Google   Un enlace privado (webcal://…?t=token) que el
--                             Calendario del iPhone o Google Calendar
--                             SUSCRIBEN. Lo sirve la Edge Function
--                             `calendario` en formato iCalendar (.ics) con
--                             citas, entregas, inicios, recordatorios y
--                             tareas. Lo nuevo en ANIMA aparece solo.
--
--   iPhone / Google → ANIMA   El Alma pega la dirección iCal privada de su
--                             calendario (Google: «Dirección secreta en
--                             formato iCal»; iCloud: «Calendario público»).
--                             La función la lee cada 30 min y guarda los
--                             eventos para mostrarlos en el calendario de
--                             ANIMA.
--
--   cal_feeds     el token del enlace de suscripción (uno por Alma)
--   cal_sources   calendarios externos que el Alma importa
--   cal_events    sus eventos ya desplegados (incluye repeticiones)
-- =====================================================================

create table if not exists public.cal_feeds (
  alma_id     uuid primary key references public.almas(id) on delete cascade,
  token       text not null unique,
  created_at  timestamptz not null default now(),
  last_read_at timestamptz                          -- la última vez que un calendario lo pidió
);

create table if not exists public.cal_sources (
  id           uuid primary key default gen_random_uuid(),
  alma_id      uuid not null references public.almas(id) on delete cascade,
  name         text not null,
  url          text not null,                       -- dirección iCal privada: solo la ve su dueño
  color        text,
  last_sync_at timestamptz,
  last_ok      boolean,
  last_msg     text,
  n_events     integer not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists cal_sources_alma on public.cal_sources (alma_id);

create table if not exists public.cal_events (
  id         uuid primary key default gen_random_uuid(),
  alma_id    uuid not null references public.almas(id) on delete cascade,
  source_id  uuid not null references public.cal_sources(id) on delete cascade,
  uid        text,
  start_at   timestamptz not null,
  end_at     timestamptz,
  all_day    boolean not null default false,
  title      text,
  location   text
);
create index if not exists cal_events_alma_start on public.cal_events (alma_id, start_at);
create index if not exists cal_events_source on public.cal_events (source_id);

alter table public.cal_feeds   enable row level security;
alter table public.cal_sources enable row level security;
alter table public.cal_events  enable row level security;

-- El token lo crea la función (para que siempre sea aleatorio de verdad).
drop policy if exists cal_feeds_read on public.cal_feeds;
create policy cal_feeds_read on public.cal_feeds
  for select to authenticated using ((select public.owns_alma(alma_id)));

drop policy if exists cal_sources_own on public.cal_sources;
create policy cal_sources_own on public.cal_sources
  for all to authenticated
  using ((select public.owns_alma(alma_id))) with check ((select public.owns_alma(alma_id)));

drop policy if exists cal_events_read on public.cal_events;
create policy cal_events_read on public.cal_events
  for select to authenticated using ((select public.owns_alma(alma_id)));

comment on table public.cal_sources is
  'Calendarios externos (iCloud/Google) que el Alma importa a STUDIO. La URL es secreta: RLS solo el dueño.';

-- Cada 30 minutos se releen los calendarios importados.
do $$ begin
  if exists (select 1 from cron.job where jobname = 'calendario-30min') then perform cron.unschedule('calendario-30min'); end if;
end $$;
select cron.schedule('calendario-30min', '*/30 * * * *', $cron$
  select net.http_post(
    url := 'https://jwxeowowuxmijuexdrua.supabase.co/functions/v1/calendario',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-key', public.meta_secret_get('meta_leads_cron_key')),
    body := '{"action":"cron"}'::jsonb, timeout_milliseconds := 60000);
$cron$);
