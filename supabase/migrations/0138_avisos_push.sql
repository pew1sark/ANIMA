-- =====================================================================
-- 0138 · Avisos al teléfono (Web Push) — ANIMA STUDIO
--
-- Notificaciones que llegan al celular aunque ANIMA esté cerrado:
--   · al instante, cuando un potencial cliente llena el formulario de un
--     anuncio (INSERT en client_leads → Edge Function `push`);
--   · un resumen diario de proyectos (entregas de hoy y mañana, atrasos,
--     cotizaciones sin respuesta, saldos por cobrar, solicitudes sin
--     contestar) a la hora que elija el Alma;
--   · recordatorios puntuales que el Alma agenda en un proyecto.
--
--   push_subscriptions   un teléfono/navegador suscrito (endpoint + llaves)
--   notif_prefs          qué avisos quiere cada Alma y a qué hora
--   project_reminders    recordatorios con fecha y hora
--   push_secret_*        llaves VAPID en Vault (solo service_role)
--   cron push-tick       cada 5 minutos: recordatorios vencidos y resumen
-- =====================================================================

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  alma_id     uuid not null references public.almas(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  device      text,                         -- «iPhone · Safari», para reconocerlo en la lista
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz,
  fail_count  integer not null default 0
);
create index if not exists push_subscriptions_alma on public.push_subscriptions (alma_id);

create table if not exists public.notif_prefs (
  alma_id       uuid primary key references public.almas(id) on delete cascade,
  leads         boolean not null default true,    -- nuevo potencial cliente, al instante
  resumen       boolean not null default true,    -- resumen diario de proyectos
  hora          smallint not null default 9 check (hora between 0 and 23),
  tz            text not null default 'America/Santiago',
  last_resumen  date,
  updated_at    timestamptz not null default now()
);

create table if not exists public.project_reminders (
  id          uuid primary key default gen_random_uuid(),
  alma_id     uuid not null references public.almas(id) on delete cascade,
  project_id  uuid references public.projects(id) on delete cascade,
  at          timestamptz not null,
  text        text not null,
  sent_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists project_reminders_pendientes on public.project_reminders (at) where sent_at is null;
create index if not exists project_reminders_alma on public.project_reminders (alma_id, at);

alter table public.push_subscriptions enable row level security;
alter table public.notif_prefs        enable row level security;
alter table public.project_reminders          enable row level security;

-- Suscribir pasa por la función (un endpoint puede cambiar de Alma en el
-- mismo teléfono); el Alma ve y borra los suyos.
drop policy if exists push_subscriptions_read on public.push_subscriptions;
create policy push_subscriptions_read on public.push_subscriptions
  for select to authenticated using ((select public.owns_alma(alma_id)));
drop policy if exists push_subscriptions_delete on public.push_subscriptions;
create policy push_subscriptions_delete on public.push_subscriptions
  for delete to authenticated using ((select public.owns_alma(alma_id)));

drop policy if exists notif_prefs_own on public.notif_prefs;
create policy notif_prefs_own on public.notif_prefs
  for all to authenticated
  using ((select public.owns_alma(alma_id))) with check ((select public.owns_alma(alma_id)));

drop policy if exists project_reminders_own on public.project_reminders;
create policy project_reminders_own on public.project_reminders
  for all to authenticated
  using ((select public.owns_alma(alma_id))) with check ((select public.owns_alma(alma_id)));

-- Llaves VAPID (las genera la función la primera vez). Solo nombres push_*.
create or replace function public.push_secret_get(p_name text)
returns text language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets
  where name = p_name and p_name like 'push\_%' limit 1;
$$;
create or replace function public.push_secret_set(p_name text, p_value text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_name is null or p_name not like 'push\_%' then raise exception 'Nombre de secreto no permitido'; end if;
  select id into v_id from vault.secrets where name = p_name;
  if v_id is null then perform vault.create_secret(p_value, p_name, 'ANIMA · avisos push');
  else perform vault.update_secret(v_id, p_value); end if;
end; $$;
revoke all on function public.push_secret_get(text) from public, anon, authenticated;
revoke all on function public.push_secret_set(text, text) from public, anon, authenticated;
grant execute on function public.push_secret_get(text) to service_role;
grant execute on function public.push_secret_set(text, text) to service_role;

-- Aviso al instante: cada solicitud que entra (salvo las anotadas a mano)
-- le pide a la función que avise. pg_net es asíncrono: el INSERT no espera.
create or replace function public.push_aviso_lead()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.source is distinct from 'manual' then
    perform net.http_post(
      url     := 'https://jwxeowowuxmijuexdrua.supabase.co/functions/v1/push',
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'x-cron-key', public.meta_secret_get('meta_leads_cron_key')),
      body    := jsonb_build_object('action', 'lead', 'id', new.id),
      timeout_milliseconds := 10000);
  end if;
  return new;
exception when others then
  return new;      -- un aviso que falla nunca bloquea la llegada de un cliente
end; $$;

drop trigger if exists client_leads_push on public.client_leads;
create trigger client_leads_push after insert on public.client_leads
  for each row execute function public.push_aviso_lead();

-- Cada 5 minutos: recordatorios vencidos y, a la hora de cada Alma, el resumen.
do $$ begin
  if exists (select 1 from cron.job where jobname = 'push-tick') then perform cron.unschedule('push-tick'); end if;
end $$;
select cron.schedule('push-tick', '*/5 * * * *', $cron$
  select net.http_post(
    url := 'https://jwxeowowuxmijuexdrua.supabase.co/functions/v1/push',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-key', public.meta_secret_get('meta_leads_cron_key')),
    body := '{"action":"tick"}'::jsonb, timeout_milliseconds := 30000);
$cron$);
