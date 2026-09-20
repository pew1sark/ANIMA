begin;

-- ---------------------------------------------------------------------------
-- El Cotizador pasa a ser un complemento que enciende soporte
-- ---------------------------------------------------------------------------
-- El Centro documental —cotizaciones, propuestas, facturas, acuerdos, cada uno
-- con su plantilla y su PDF— venía encendido para todo el mundo desde el primer
-- minuto. Es la pieza que más trabajo tiene detrás y la que más soporte pide:
-- alguien que emite una cotización con su marca encima quiere que salga bien.
--
-- Deja de venir con el plan y pasa a ser un COMPLEMENTO: lo enciende soporte,
-- Alma por Alma, cuando lo acuerda con quien lo pide.
--
-- Esta tabla es el interruptor. No guarda precio ni factura: eso vive en la
-- relación comercial. Guarda tres cosas y ninguna más: quién lo pidió, quién lo
-- encendió y cuándo. Con eso, la pantalla sabe qué mostrar y soporte sabe a
-- quién responder.
--
-- Un complemento tiene tres estados y se pasa de uno a otro en una sola
-- dirección por cada lado:
--
--   inactivo    — no lo tiene y no lo ha pedido. Es el estado de partida y no
--                 necesita fila: la ausencia ya lo dice.
--   solicitado  — lo pidió desde su Taller. Solo puede ponerlo el Alma.
--   activo      — soporte lo encendió. Solo puede ponerlo el Creador.
--
-- Apagar también es cosa del Creador, y deja la fila con su historia: saber que
-- alguien tuvo el Cotizador seis meses y lo dejó es información, no basura.

create table if not exists public.alma_addons (
  alma_id      uuid    not null references public.almas(id) on delete cascade,
  addon        text    not null,
  estado       text    not null default 'solicitado'
                 check (estado in ('solicitado','activo','inactivo')),
  nota         text,
  solicitado_at timestamptz,
  activado_at   timestamptz,
  activado_por  uuid    references auth.users(id) on delete set null,
  updated_at    timestamptz not null default now(),
  primary key (alma_id, addon)
);

comment on table public.alma_addons is
  'Complementos de ANIMA STUDIO encendidos por soporte, uno por Alma. La ausencia de fila es "no lo tiene".';

create index if not exists alma_addons_estado_idx on public.alma_addons(estado, addon);

alter table public.alma_addons enable row level security;

-- Cada Alma ve los suyos. El Creador ve todos (la política de abajo lo incluye
-- por `is_creator`, que ya distingue su correo en el JWT).
drop policy if exists "alma_addons_lectura" on public.alma_addons;
create policy "alma_addons_lectura" on public.alma_addons
  for select to authenticated
  using (public.owns_alma(alma_id) or public.is_creator());

-- Escribir no se hace con INSERT: se hace con las dos funciones de abajo, que
-- son las que saben quién puede pedir y quién puede encender. Sin política de
-- escritura, la tabla no acepta nada que no venga de ellas.
--
-- Y por si acaso, también sin el permiso: RLS ya lo impediría, pero los
-- permisos por defecto de Supabase reparten INSERT y UPDATE a `authenticated`
-- sobre todo lo que se cree en `public`, y una tabla que decide quién tiene
-- qué complemento no debería depender de una sola capa.
revoke all on public.alma_addons from anon, authenticated;
grant  select on public.alma_addons to authenticated;

-- Pedir un complemento — lo hace el Alma, desde su Taller ------------------
create or replace function public.solicitar_addon(p_addon text, p_nota text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alma   uuid;
  v_estado text;
begin
  select id into v_alma from public.almas where user_id = auth.uid();
  if v_alma is null then
    raise exception 'Necesitas un Alma para pedir un complemento.';
  end if;

  p_addon := lower(btrim(coalesce(p_addon, '')));
  if p_addon = '' then
    raise exception 'Falta el nombre del complemento.';
  end if;

  select estado into v_estado from public.alma_addons
   where alma_id = v_alma and addon = p_addon;

  -- Si ya está encendido, pedirlo otra vez no lo apaga ni lo reinicia.
  if v_estado = 'activo' then
    return 'activo';
  end if;

  insert into public.alma_addons (alma_id, addon, estado, nota, solicitado_at, updated_at)
  values (v_alma, p_addon, 'solicitado', nullif(btrim(coalesce(p_nota,'')), ''), now(), now())
  on conflict (alma_id, addon) do update
    set estado        = 'solicitado',
        nota          = coalesce(excluded.nota, alma_addons.nota),
        solicitado_at = now(),
        updated_at    = now();

  return 'solicitado';
end;
$$;

revoke execute on function public.solicitar_addon(text, text) from public, anon;
grant  execute on function public.solicitar_addon(text, text) to authenticated;

-- Encender o apagar — solo soporte ----------------------------------------
create or replace function public.activar_addon(p_alma uuid, p_addon text, p_encender boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estado text := case when p_encender then 'activo' else 'inactivo' end;
begin
  if not public.is_creator() then
    raise exception 'Solo soporte enciende un complemento.';
  end if;

  p_addon := lower(btrim(coalesce(p_addon, '')));
  if p_addon = '' then
    raise exception 'Falta el nombre del complemento.';
  end if;

  insert into public.alma_addons (alma_id, addon, estado, activado_at, activado_por, updated_at)
  values (p_alma, p_addon, v_estado,
          case when p_encender then now() else null end,
          auth.uid(), now())
  on conflict (alma_id, addon) do update
    set estado       = v_estado,
        activado_at  = case when p_encender then now() else alma_addons.activado_at end,
        activado_por = auth.uid(),
        updated_at   = now();

  return v_estado;
end;
$$;

revoke execute on function public.activar_addon(uuid, text, boolean) from public, anon;
grant  execute on function public.activar_addon(uuid, text, boolean) to authenticated;

-- La bandeja de soporte: qué complementos están pedidos y por quién ---------
create or replace function public.addons_pendientes()
returns table (
  alma_id       uuid,
  alma_nombre   text,
  addon         text,
  estado        text,
  nota          text,
  solicitado_at timestamptz,
  activado_at   timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select x.alma_id, a.name, x.addon, x.estado, x.nota, x.solicitado_at, x.activado_at
    from public.alma_addons x
    join public.almas a on a.id = x.alma_id
   where public.is_creator()
   order by (x.estado = 'solicitado') desc, x.updated_at desc;
$$;

revoke execute on function public.addons_pendientes() from public, anon;
grant  execute on function public.addons_pendientes() to authenticated;

commit;
