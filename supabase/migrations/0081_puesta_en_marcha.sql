-- 0081 — La ficha de la empresa: puesta en marcha
--
-- Lo que hay que preguntar UNA vez para que la plataforma deje de ser genérica:
-- cómo se llama de verdad la empresa, su RUT, su giro, dónde está, en qué
-- moneda trabaja y cómo opera. Con eso los documentos salen con sus datos y
-- las pantallas hablan de su negocio y no de "la organización".
--
-- Los datos de identidad viven en `companies` (los lee media aplicación) y el
-- resto en `company_config` bajo la clave `ficha`. Se escriben juntos, en una
-- sola función, para que no queden a medias.

begin;

-- ---------------------------------------------------------------------------
-- 1. La configuración no la cambia cualquiera
-- ---------------------------------------------------------------------------
-- `company_config` estaba abierta a escritura desde nivel 40: un empleado podía
-- cambiar las reglas de operación de la empresa. Leer sí es de todos —las
-- pantallas la necesitan—, escribir es de nivel 80.

drop policy if exists company_config_company on public.company_config;

create policy company_config_read on public.company_config
  for select using (public.has_company_level(company_id, 40) or public.is_platform_admin());

create policy company_config_write on public.company_config
  for all
  using (public.has_company_level(company_id, 80) or public.is_platform_admin())
  with check (public.has_company_level(company_id, 80) or public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 2. Leer la ficha
-- ---------------------------------------------------------------------------

create or replace function public.ficha_empresa(p_company uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select case when not public.has_company_level(p_company, 40) then '{}'::jsonb else
    (select jsonb_build_object(
        'nombre',   c.name,
        'moneda',   c.currency,
        'pais',     c.country,
        'zona',     c.timezone,
        'estado',   c.status,
        'linea',    (select pl.name from public.product_lines pl where pl.id = c.product_line_id))
     || coalesce((select cc.value from public.company_config cc
                   where cc.company_id = p_company and cc.key = 'ficha'), '{}'::jsonb)
       from public.companies c where c.id = p_company)
  end;
$fn$;

comment on function public.ficha_empresa(uuid) is
  'Identidad y datos comerciales de la empresa, para la puesta en marcha.';

revoke all on function public.ficha_empresa(uuid) from public, anon;
grant execute on function public.ficha_empresa(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Guardarla
-- ---------------------------------------------------------------------------
-- Una sola escritura para las dos mitades. Si `companies` acepta y
-- `company_config` no, la empresa quedaría con el nombre nuevo y la dirección
-- vieja; dentro de una función eso no puede pasar.

create or replace function public.guardar_ficha_empresa(p_company uuid, p_ficha jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_nombre text := nullif(btrim(p_ficha->>'nombre'), '');
  v_resto  jsonb;
begin
  if not public.has_company_level(p_company, 80) then
    raise exception 'Solo un administrador puede cambiar la ficha de la empresa';
  end if;

  update public.companies
     set name     = coalesce(v_nombre, name),
         currency = coalesce(nullif(p_ficha->>'moneda', ''), currency),
         country  = coalesce(nullif(p_ficha->>'pais',   ''), country),
         timezone = coalesce(nullif(p_ficha->>'zona',   ''), timezone),
         updated_at = now()
   where id = p_company;

  /* Lo que no es identidad va a la ficha. Se quitan las claves que ya viven en
     `companies` para no guardar dos veces la misma verdad. */
  v_resto := (p_ficha - 'nombre' - 'moneda' - 'pais' - 'zona' - 'estado' - 'linea');

  insert into public.company_config (company_id, key, value, description)
  values (p_company, 'ficha', v_resto, 'Datos comerciales de la empresa')
  on conflict (company_id, key) do update
     set value = excluded.value, updated_at = now();

  return public.ficha_empresa(p_company);
end;
$fn$;

comment on function public.guardar_ficha_empresa(uuid, jsonb) is
  'Guarda identidad y datos comerciales de la empresa en una sola escritura. Nivel 80.';

revoke all on function public.guardar_ficha_empresa(uuid, jsonb) from public, anon;
grant execute on function public.guardar_ficha_empresa(uuid, jsonb) to authenticated;

commit;
