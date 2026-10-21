-- =====================================================================
-- 0145 · Facturación electrónica con el SII (ANIMA STUDIO)
--
-- STUDIO → Taller → Facturas. El Alma emite factura (33), factura exenta
-- (34), boleta (39) y nota de crédito (61), y ANIMA las firma y las envía
-- directo al SII desde la Edge Function `sii-dte`.
--
--   sii_emisor        datos tributarios del Alma y ambiente (certificación / producción)
--   sii_folios        rangos de folios autorizados (CAF) y cuál toca usar
--   sii_documentos    cada documento emitido, su XML firmado y su estado en el SII
--   sii_secret_*      certificado digital, su clave y los CAF viven cifrados en Vault;
--                     solo la Edge Function (service_role) los lee
--
-- Nada de esto se escribe desde el navegador: el Alma solo LEE sus filas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1 · Emisor
-- ---------------------------------------------------------------------
create table if not exists public.sii_emisor (
  alma_id        uuid primary key references public.almas(id) on delete cascade,
  rut            text not null,
  razon_social   text not null,
  giro           text not null,
  acteco         integer not null,            -- código de actividad económica
  direccion      text not null,
  comuna         text not null,
  ciudad         text,
  email          text,
  rut_envia      text not null,               -- RUT del titular del certificado digital
  resol_fecha    date not null,               -- resolución que lo autoriza como emisor
  resol_numero   integer not null default 0,  -- 0 en certificación
  ambiente       text not null default 'certificacion' check (ambiente in ('certificacion','produccion')),
  cert_vence     date,                        -- null = aún no sube certificado
  actualizado_en timestamptz not null default now()
);

alter table public.sii_emisor enable row level security;

drop policy if exists sii_emisor_read on public.sii_emisor;
create policy sii_emisor_read on public.sii_emisor
  for select to authenticated
  using ((select public.owns_alma(alma_id)));

-- ---------------------------------------------------------------------
-- 2 · Folios (CAF)
--     El XML del CAF trae la llave privada de folios: va a Vault, aquí solo
--     queda el rango. `siguiente` avanza de forma atómica en sii_tomar_folio.
-- ---------------------------------------------------------------------
create table if not exists public.sii_folios (
  id           uuid primary key default gen_random_uuid(),
  alma_id      uuid not null references public.almas(id) on delete cascade,
  ambiente     text not null check (ambiente in ('certificacion','produccion')),
  tipo         integer not null check (tipo in (33,34,39,61)),
  desde        integer not null check (desde > 0),
  hasta        integer not null,
  siguiente    integer not null,
  autorizado   date,
  creado_en    timestamptz not null default now(),
  constraint sii_folios_rango check (hasta >= desde and siguiente between desde and hasta + 1),
  constraint sii_folios_unico unique (alma_id, ambiente, tipo, desde)
);
create index if not exists sii_folios_busca on public.sii_folios (alma_id, ambiente, tipo);

alter table public.sii_folios enable row level security;

drop policy if exists sii_folios_read on public.sii_folios;
create policy sii_folios_read on public.sii_folios
  for select to authenticated
  using ((select public.owns_alma(alma_id)));

-- ---------------------------------------------------------------------
-- 3 · Documentos
-- ---------------------------------------------------------------------
create table if not exists public.sii_documentos (
  id            uuid primary key default gen_random_uuid(),
  alma_id       uuid not null references public.almas(id) on delete cascade,
  ambiente      text not null check (ambiente in ('certificacion','produccion')),
  tipo          integer not null check (tipo in (33,34,39,61)),
  folio         integer not null,
  fecha_emision date not null,
  receptor      jsonb not null default '{}'::jsonb,
  items         jsonb not null default '[]'::jsonb,
  referencia    jsonb,                          -- notas de crédito: documento que corrigen
  neto          bigint not null default 0,
  exento        bigint not null default 0,
  iva           bigint not null default 0,
  total         bigint not null default 0,
  -- firmado: listo pero sin enviar · enviado: el SII tiene el track · aceptado
  -- · reparos · rechazado · error: no se pudo hablar con el SII
  estado        text not null default 'firmado'
                check (estado in ('firmado','enviado','aceptado','reparos','rechazado','error')),
  track_id      text,
  glosa         text,                           -- último mensaje del SII
  xml           text,                           -- sobre firmado (sin llaves)
  creado_en     timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint sii_documentos_folio unique (alma_id, ambiente, tipo, folio)
);
create index if not exists sii_documentos_alma on public.sii_documentos (alma_id, creado_en desc);

alter table public.sii_documentos enable row level security;

drop policy if exists sii_documentos_read on public.sii_documentos;
create policy sii_documentos_read on public.sii_documentos
  for select to authenticated
  using ((select public.owns_alma(alma_id)));

-- ---------------------------------------------------------------------
-- 4 · Secretos en Vault (solo nombres "sii_…", solo service_role)
-- ---------------------------------------------------------------------
create or replace function public.sii_secret_set(p_name text, p_value text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if p_name is null or p_name not like 'sii\_%' then
    raise exception 'Nombre de secreto no permitido';
  end if;
  select id into v_id from vault.secrets where name = p_name;
  if v_id is null then
    perform vault.create_secret(p_value, p_name, 'ANIMA · Facturación SII');
  else
    perform vault.update_secret(v_id, p_value);
  end if;
end;
$$;

create or replace function public.sii_secret_get(p_name text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets
  where name = p_name and p_name like 'sii\_%'
  limit 1;
$$;

create or replace function public.sii_secret_forget(p_name text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from vault.secrets where name = p_name and p_name like 'sii\_%';
$$;

revoke all on function public.sii_secret_set(text, text) from public, anon, authenticated;
revoke all on function public.sii_secret_get(text)       from public, anon, authenticated;
revoke all on function public.sii_secret_forget(text)    from public, anon, authenticated;
grant execute on function public.sii_secret_set(text, text) to service_role;
grant execute on function public.sii_secret_get(text)       to service_role;
grant execute on function public.sii_secret_forget(text)    to service_role;

-- ---------------------------------------------------------------------
-- 5 · Tomar el siguiente folio, de a uno y sin carreras
--     Devuelve null si no quedan folios. Dos emisiones a la vez nunca
--     reciben el mismo número: el SII rechaza un folio repetido.
-- ---------------------------------------------------------------------
create or replace function public.sii_tomar_folio(p_alma uuid, p_ambiente text, p_tipo integer)
returns table (folio_id uuid, folio integer)
language plpgsql
security definer
set search_path = public
as $$
declare v public.sii_folios%rowtype;
begin
  select * into v from public.sii_folios
   where alma_id = p_alma and ambiente = p_ambiente and tipo = p_tipo and siguiente <= hasta
   order by desde
   limit 1
   for update;
  if not found then return; end if;
  update public.sii_folios set siguiente = siguiente + 1 where id = v.id;
  folio_id := v.id; folio := v.siguiente;
  return next;
end;
$$;

revoke execute on function public.sii_tomar_folio(uuid, text, integer) from public, anon, authenticated;
grant  execute on function public.sii_tomar_folio(uuid, text, integer) to service_role;
