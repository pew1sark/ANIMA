-- 0079 — La marca del cliente, y cómo se pide entrar
--
-- Dos cosas que le faltaban a la plataforma para poder mostrarse a un cliente:
--
--   1. Que la empresa ponga su logo. ANIMA no desaparece: baja al pie como
--      "Powered by ANIMA TSC". Arriba manda la marca de quien trabaja.
--   2. Una puerta para pedir acceso. Las cuentas no se crean solas: se piden,
--      y alguien las abre. Esto guarda la petición; no manda correo.

begin;

-- ---------------------------------------------------------------------------
-- 1. Dónde vive el logo
-- ---------------------------------------------------------------------------
-- Bucket público a propósito: un logo se muestra en la interfaz y no tiene por
-- qué pasar por una URL firmada que caduca. Lo que se protege es quién puede
-- SUBIRLO. La ruta es <company_id>/…, igual que el bucket `companies`.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marcas', 'marcas', true, 2097152,
        array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict (id) do update
   set public = excluded.public,
       file_size_limit = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists marcas_public_read on storage.objects;
create policy marcas_public_read on storage.objects
  for select using (bucket_id = 'marcas');

-- Escribir el logo es cambiar la cara de la empresa: nivel 80 para arriba.
drop policy if exists marcas_admin_insert on storage.objects;
create policy marcas_admin_insert on storage.objects
  for insert with check (
    bucket_id = 'marcas'
    and public.has_company_level(nullif((storage.foldername(name))[1], '')::uuid, 80)
  );

drop policy if exists marcas_admin_update on storage.objects;
create policy marcas_admin_update on storage.objects
  for update using (
    bucket_id = 'marcas'
    and public.has_company_level(nullif((storage.foldername(name))[1], '')::uuid, 80)
  );

drop policy if exists marcas_admin_delete on storage.objects;
create policy marcas_admin_delete on storage.objects
  for delete using (
    bucket_id = 'marcas'
    and public.has_company_level(nullif((storage.foldername(name))[1], '')::uuid, 80)
  );

-- ---------------------------------------------------------------------------
-- 2. Guardar la marca
-- ---------------------------------------------------------------------------
-- `companies.branding` ya existía como jsonb libre. Esto le da forma y deja el
-- permiso en un solo lugar, en vez de repartirlo por políticas de columna.

create or replace function public.guardar_marca(
  p_company uuid,
  p_logo_url text default null,
  p_color text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_marca jsonb;
begin
  if not public.has_company_level(p_company, 80) then
    raise exception 'No tienes permiso para cambiar la marca de esta organización';
  end if;

  -- Un color tiene que ser un color. Si llega cualquier cosa, no se guarda.
  if p_color is not null and p_color !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'El color debe venir como #rrggbb';
  end if;

  update public.companies
     set branding = coalesce(branding, '{}'::jsonb)
                  || jsonb_build_object('logo_url', p_logo_url, 'color', p_color)
   where id = p_company
   returning branding into v_marca;

  return v_marca;
end;
$fn$;

comment on function public.guardar_marca(uuid, text, text) is
  'Guarda el logo y el color de una organización. Solo desde nivel 80.';

revoke all on function public.guardar_marca(uuid, text, text) from public, anon;
grant execute on function public.guardar_marca(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Pedir acceso
-- ---------------------------------------------------------------------------
-- No hay registro abierto: se pide y alguien abre la puerta. La petición se
-- guarda aquí y se ve en la consola. Todavía no sale ningún correo — eso llega
-- cuando se porte el correo saliente de JLIZ.

create table if not exists public.access_requests (
  id           uuid primary key default gen_random_uuid(),
  email        text        not null,
  nombre       text,
  organizacion text,
  linea        text        not null default 'company'
               check (linea in ('studio', 'company')),
  mensaje      text,
  status       text        not null default 'pendiente'
               check (status in ('pendiente', 'invitada', 'rechazada')),
  notas        text,
  created_at   timestamptz not null default now(),
  resuelta_at  timestamptz,
  resuelta_por uuid references auth.users(id) on delete set null
);

comment on table public.access_requests is
  'Peticiones de acceso desde el login. No crean cuenta: alguien las revisa.';

-- Una sola petición pendiente por correo: pulsar el botón diez veces no crea
-- diez filas que después haya que limpiar a mano.
create unique index if not exists access_requests_email_pendiente
  on public.access_requests (lower(email))
  where status = 'pendiente';

create index if not exists access_requests_status_fecha
  on public.access_requests (status, created_at desc);

alter table public.access_requests enable row level security;

-- Cualquiera puede pedir. Nadie puede leer lo que pidieron los demás: no hay
-- política de select para anon, así que el formulario escribe y no ve nada.
drop policy if exists access_requests_pedir on public.access_requests;
create policy access_requests_pedir on public.access_requests
  for insert to anon, authenticated
  with check (status = 'pendiente' and resuelta_at is null and resuelta_por is null);

drop policy if exists access_requests_admin on public.access_requests;
create policy access_requests_admin on public.access_requests
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

grant insert on public.access_requests to anon, authenticated;
grant select, update, delete on public.access_requests to authenticated;

commit;
