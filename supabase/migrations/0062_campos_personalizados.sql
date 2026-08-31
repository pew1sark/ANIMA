-- 0062 · CAMPOS PERSONALIZADOS
-- Decision de diseno: definiciones en tabla, valores en una columna JSONB de
-- la propia entidad, e indice GIN encima.
--   · No se crea una columna por cada campo de cada cliente (inmanejable).
--   · No se usa una tabla de valores clave-valor (mata las consultas: cada
--     campo mostrado seria un JOIN mas).
--   · El JSONB vive junto a la fila, se lee sin JOIN, y el GIN permite
--     filtrar por cualquier campo sin indices nuevos.
-- El precio es que no hay integridad referencial dentro del JSONB; por eso
-- existe la validacion por disparador contra las definiciones.

do $$ begin create type public.custom_field_type as enum
  ('texto','numero','entero','fecha','booleano','seleccion','multiseleccion','moneda');
exception when duplicate_object then null; end $$;

create table if not exists public.custom_fields (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  entity text not null,                    -- 'products', 'customers', 'orders'…
  key    text not null,                    -- identificador estable, no cambia
  label  text not null,                    -- lo que ve el usuario, si cambia
  field_type public.custom_field_type not null default 'texto',
  options jsonb not null default '[]'::jsonb,   -- para seleccion
  required boolean not null default false,
  help text,
  sort int not null default 100,
  active boolean not null default true,
  -- De donde salio el campo: 'levantamiento' si lo genero la encuesta
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  unique (company_id, entity, key),
  constraint custom_fields_key_format check (key ~ '^[a-z][a-z0-9_]{0,38}$')
);
comment on table public.custom_fields is 'Definiciones. Los valores viven en la columna custom de cada entidad.';

create index if not exists custom_fields_company_idx on public.custom_fields(company_id, entity) where active;

alter table public.custom_fields enable row level security;
drop policy if exists custom_fields_read on public.custom_fields;
create policy custom_fields_read on public.custom_fields for select to authenticated
  using (public.is_company_member(company_id) or public.is_platform_admin());
drop policy if exists custom_fields_write on public.custom_fields;
create policy custom_fields_write on public.custom_fields for all to authenticated
  using (public.has_company_level(company_id, 80)) with check (public.has_company_level(company_id, 80));

-- ---------- La columna de valores en cada entidad ----------
do $$
declare t text;
begin
  foreach t in array array['products','customers','orders','order_items','suppliers',
                           'inventory_lots','purchases','deliveries','projects','clients'] loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table public.%I add column if not exists custom jsonb not null default ''{}''::jsonb', t);
      execute format('create index if not exists %I on public.%I using gin (custom jsonb_path_ops)',
                     t||'_custom_gin', t);
    end if;
  end loop;
end $$;

-- ---------- Validacion contra las definiciones ----------
create or replace function public.validate_custom(p_company uuid, p_entity text, p_data jsonb)
returns text language plpgsql stable security definer set search_path = public, pg_temp as $$
declare f record; v jsonb;
begin
  if p_company is null then return null; end if;

  for f in select * from public.custom_fields
           where company_id = p_company and entity = p_entity and active loop
    v := p_data -> f.key;

    if f.required and (v is null or v = 'null'::jsonb or v = '""'::jsonb) then
      return format('El campo "%s" es obligatorio', f.label);
    end if;
    if v is null or v = 'null'::jsonb then continue; end if;

    case f.field_type
      when 'numero','moneda' then
        if jsonb_typeof(v) <> 'number' then return format('"%s" debe ser un numero', f.label); end if;
      when 'entero' then
        if jsonb_typeof(v) <> 'number' or (v::text ~ '\.') then
          return format('"%s" debe ser un numero entero', f.label);
        end if;
      when 'booleano' then
        if jsonb_typeof(v) <> 'boolean' then return format('"%s" debe ser si o no', f.label); end if;
      when 'fecha' then
        begin perform (v #>> '{}')::date;
        exception when others then return format('"%s" debe ser una fecha valida', f.label); end;
      when 'seleccion' then
        if f.options <> '[]'::jsonb and not (f.options @> jsonb_build_array(v #>> '{}')) then
          return format('"%s" no admite el valor "%s"', f.label, v #>> '{}');
        end if;
      when 'multiseleccion' then
        if jsonb_typeof(v) <> 'array' then return format('"%s" debe ser una lista', f.label); end if;
      else null;
    end case;
  end loop;
  return null;
end $$;
revoke execute on function public.validate_custom(uuid,text,jsonb) from public, anon;
grant  execute on function public.validate_custom(uuid,text,jsonb) to authenticated;

create or replace function public.trg_validate_custom()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_err text;
begin
  if new.custom is null or new.custom = '{}'::jsonb then
    -- Aun asi hay que exigir los obligatorios
    v_err := public.validate_custom(new.company_id, tg_table_name, '{}'::jsonb);
  else
    v_err := public.validate_custom(new.company_id, tg_table_name, new.custom);
  end if;
  if v_err is not null then raise exception '%', v_err; end if;
  return new;
end $$;
revoke execute on function public.trg_validate_custom() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['products','customers','orders','suppliers','inventory_lots','purchases'] loop
    execute format('drop trigger if exists %I on public.%I', t||'_validate_custom', t);
    execute format('create trigger %I before insert or update of custom on public.%I
                    for each row execute function public.trg_validate_custom()', t||'_validate_custom', t);
  end loop;
end $$;

-- Que campos tiene esta empresa para esta entidad (lo consume el formulario)
create or replace function public.custom_fields_for(p_entity text, p_company uuid default null)
returns table(key text, label text, field_type public.custom_field_type,
              options jsonb, required boolean, help text, sort int)
language sql stable security invoker set search_path = public, pg_temp as $$
  select key, label, field_type, options, required, help, sort
  from public.custom_fields
  where company_id = coalesce(p_company, public.current_company())
    and entity = p_entity and active
  order by sort, label;
$$;
revoke execute on function public.custom_fields_for(text,uuid) from public, anon;
grant  execute on function public.custom_fields_for(text,uuid) to authenticated;

-- ---------- Los campos de pescaderia dejan de ser del Core ----------
-- Esto es lo que species_id e ice_weight deberian haber sido siempre.
insert into public.custom_fields (company_id, entity, key, label, field_type, options, required, help, sort, source)
select c.id, 'products', v.key, v.label, v.tipo::public.custom_field_type,
       v.opts::jsonb, v.req, v.ayuda, v.orden, 'levantamiento'
from public.companies c,
(values
 ('especie','Especie','texto','[]',false,'Nombre de la especie del producto',10),
 ('zona_captura','Zona de captura','texto','[]',false,'Exigido por Sernapesca en la trazabilidad',20),
 ('presentacion_corte','Tipo de corte','seleccion','["Entero","HG","Filete c/piel","Filete s/piel","Medallon","Trozado"]',false,'Como se entrega el producto',30),
 ('requiere_frio','Cadena de frio','booleano','[]',false,'Si necesita control de temperatura',40)
) as v(key,label,tipo,opts,req,ayuda,orden)
where c.slug='bilagay'
on conflict (company_id, entity, key) do nothing;

insert into public.custom_fields (company_id, entity, key, label, field_type, required, help, sort, source)
select c.id, 'inventory_lots', v.key, v.label, v.tipo::public.custom_field_type, v.req, v.ayuda, v.orden, 'levantamiento'
from public.companies c,
(values
 ('temperatura_recepcion','Temperatura al recibir','numero',false,'Grados Celsius medidos con termometro de punzon',10),
 ('fecha_captura','Fecha de captura','fecha',false,'Distinta de la fecha de recepcion',20)
) as v(key,label,tipo,req,ayuda,orden)
where c.slug='bilagay'
on conflict (company_id, entity, key) do nothing;