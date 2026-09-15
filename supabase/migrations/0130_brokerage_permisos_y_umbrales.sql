-- ===========================================================
-- 0130 · BROKERAGE — permisos, borrado lógico y umbrales
-- -----------------------------------------------------------
-- Lo mismo que 0121 hizo por el lado del desarrollo, para las seis
-- tablas comerciales. Con UNA diferencia que no es un detalle.
--
-- ---------- LAS METAS NO SON DE TODOS ----------
--
-- En el resto del módulo el corte es por empresa y está bien: el
-- inventario, la demanda y los comparables son de la organización
-- entera, y partirlos por persona dejaría el cruce oferta/demanda
-- calculado sobre la mitad de los datos.
--
-- Con las metas no. La meta de comisión de un corredor es su
-- remuneración implícita, y que cualquiera de nivel 40 pueda leerla
-- convierte el módulo en una planilla de sueldos abierta. El corte:
--
--   nivel 40 · ve SU meta y la de la oficina (las que no tienen
--              persona: empresa y ciudad). Tiene que verlas — una
--              meta que no se ve no orienta a nadie.
--   nivel 60 · ve todas. Es quien las pone y quien responde por el
--              equipo.
--
-- El resto de las tablas comerciales sí es de la organización: un
-- lead que solo ve su dueño es un lead que se pierde cuando esa
-- persona sale de vacaciones. La asignación se respeta por acuerdo y
-- se ve en los paneles; no se esconde.
--
-- ---------- POR QUÉ LOS CONTRATOS PIDEN 60 PARA ESCRIBIR ----------
--
-- Todo lo demás baja a 40, y por el mismo motivo que en 0121: pedir
-- nivel de director para anotar una llamada es la forma segura de que
-- las llamadas no se anoten. Un contrato es otra cosa: tiene canon,
-- vigencia y dos partes, y de su fecha de fin cuelga el ingreso del
-- mes que viene.
-- ===========================================================

-- ---------- 1 · BORRADO LÓGICO ----------
-- `ci_borrado_logico()` de 0096, igual que en 0121: convierte el
-- DELETE en `deleted_at = now()`. Las seis lo llevan; aquí no hay
-- tablas de cruce que justifiquen la excepción.
do $$
declare t text;
begin
  foreach t in array array['rei_leads','rei_deals','rei_visits','rei_activities',
                           'rei_contracts','rei_targets'] loop
    execute format('drop trigger if exists %I on public.%I', t||'_soft_delete', t);
    execute format('create trigger %I before delete on public.%I
                    for each row execute function public.ci_borrado_logico()', t||'_soft_delete', t);
  end loop;
end $$;

-- ---------- 2 · RLS ----------
alter table public.rei_leads      enable row level security;
alter table public.rei_deals      enable row level security;
alter table public.rei_visits     enable row level security;
alter table public.rei_activities enable row level security;
alter table public.rei_contracts  enable row level security;
alter table public.rei_targets    enable row level security;

do $$
declare r record;
begin
  for r in
    select * from (values
      -- tabla             leer  escribir  borrar
      ('rei_leads',          40,      40,     60),
      ('rei_deals',          40,      40,     60),
      ('rei_visits',         40,      40,     40),
      ('rei_activities',     40,      40,     40),
      ('rei_contracts',      40,      60,     80)
    ) as t(tabla, leer, escribir, borrar)
  loop
    execute format('drop policy if exists %I on public.%I', r.tabla||'_leer',   r.tabla);
    execute format('drop policy if exists %I on public.%I', r.tabla||'_crear',  r.tabla);
    execute format('drop policy if exists %I on public.%I', r.tabla||'_editar', r.tabla);
    execute format('drop policy if exists %I on public.%I', r.tabla||'_borrar', r.tabla);

    execute format($p$create policy %I on public.%I for select to authenticated
      using (deleted_at is null and public.has_company_level(company_id, %s))$p$,
      r.tabla||'_leer', r.tabla, r.leer);

    execute format($p$create policy %I on public.%I for insert to authenticated
      with check (public.has_company_level(company_id, %s))$p$,
      r.tabla||'_crear', r.tabla, r.escribir);

    execute format($p$create policy %I on public.%I for update to authenticated
      using (public.has_company_level(company_id, %s))
      with check (public.has_company_level(company_id, %s))$p$,
      r.tabla||'_editar', r.tabla, r.escribir, r.escribir);

    execute format($p$create policy %I on public.%I for delete to authenticated
      using (public.has_company_level(company_id, %s))$p$,
      r.tabla||'_borrar', r.tabla, r.borrar);
  end loop;
end $$;

-- Las metas, aparte. Ver la nota de la cabecera.
drop policy if exists rei_targets_leer   on public.rei_targets;
drop policy if exists rei_targets_crear  on public.rei_targets;
drop policy if exists rei_targets_editar on public.rei_targets;
drop policy if exists rei_targets_borrar on public.rei_targets;

create policy rei_targets_leer on public.rei_targets for select to authenticated
  using (deleted_at is null
         and (public.has_company_level(company_id, 60)
              or (public.has_company_level(company_id, 40)
                  and (user_id is null or user_id = auth.uid()))));

create policy rei_targets_crear on public.rei_targets for insert to authenticated
  with check (public.has_company_level(company_id, 60));

create policy rei_targets_editar on public.rei_targets for update to authenticated
  using (public.has_company_level(company_id, 60))
  with check (public.has_company_level(company_id, 60));

create policy rei_targets_borrar on public.rei_targets for delete to authenticated
  using (public.has_company_level(company_id, 80));

-- ---------- 3 · LOS UMBRALES DEL SEGUIMIENTO ----------
-- Cuándo un lead lleva demasiado sin contactar, cuándo una
-- negociación está detenida, cuándo un inmueble lleva tanto tiempo
-- publicado que el problema es el precio. Son cuatro números que
-- deciden qué avisa el sistema, y por eso van donde van todos los
-- supuestos del módulo: en `rei_parameters`, discutibles, y no dentro
-- de una consulta.
--
-- Se añaden a la semilla de 0124 —`rei_sembrar_base()`— para que una
-- organización nueva los reciba, y se cargan también a las que ya
-- existen, que si no tendrían el panel de alertas mudo.
create or replace function public.rei_sembrar_umbrales(p_company uuid)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare v int;
begin
  if not public.has_company_level(p_company, 60) then
    raise exception 'No tienes nivel para configurar el módulo en esta organización';
  end if;

  with nuevos as (
    insert into public.rei_parameters (company_id, slug, category, name, value, unit, source, notes, sort)
    select p_company, x.slug, 'comercial', x.nombre, x.valor, x.unidad, x.fuente, x.nota, x.orden
      from (values
        ('dias_primer_contacto', 'Días máximos para el primer contacto', 1.0, 'numero',
         'Práctica comercial: el tiempo de primera respuesta es lo que más decide una conversión',
         'Un lead que lleva más de esto sin salir de «nuevo» aparece en las alertas del panel.', 220),
        ('dias_deal_detenido', 'Días sin actividad para dar una negociación por detenida', 14.0, 'numero',
         'Criterio interno',
         'Una negociación abierta sin ninguna actividad registrada en este plazo se marca como detenida.', 230),
        ('dias_inmueble_estancado', 'Días publicado sin visitas para revisar el precio', 60.0, 'numero',
         'Criterio interno: días en mercado del sector',
         'Un inmueble disponible que lleva esto sin una sola visita casi nunca tiene un problema de difusión.', 240),
        ('dias_aviso_vencimiento', 'Horizonte de aviso de vencimientos', 60.0, 'numero',
         'Criterio interno',
         'Hasta cuántos días adelante mira el panel los contratos por vencer.', 250)
      ) as x(slug, nombre, valor, unidad, fuente, nota, orden)
    on conflict (company_id, slug) do nothing
    returning 1)
  select count(*) into v from nuevos;

  return v;
end $$;
comment on function public.rei_sembrar_umbrales(uuid) is
  'Carga los cuatro umbrales del seguimiento comercial. Idempotente: no pisa lo que la organización haya ajustado.';
revoke execute on function public.rei_sembrar_umbrales(uuid) from public, anon;
grant  execute on function public.rei_sembrar_umbrales(uuid) to authenticated;

-- A las organizaciones que ya tienen el módulo encendido. Se hace en
-- SQL plano y no llamando a la función porque aquí no hay sesión: el
-- `has_company_level` de adentro no tendría a quién preguntarle.
insert into public.rei_parameters (company_id, slug, category, name, value, unit, source, notes, sort)
select c.id, x.slug, 'comercial', x.nombre, x.valor, x.unidad, x.fuente, x.nota, x.orden
  from public.companies c
  cross join (values
    ('dias_primer_contacto', 'Días máximos para el primer contacto', 1.0, 'numero',
     'Práctica comercial: el tiempo de primera respuesta es lo que más decide una conversión',
     'Un lead que lleva más de esto sin salir de «nuevo» aparece en las alertas del panel.', 220),
    ('dias_deal_detenido', 'Días sin actividad para dar una negociación por detenida', 14.0, 'numero',
     'Criterio interno',
     'Una negociación abierta sin ninguna actividad registrada en este plazo se marca como detenida.', 230),
    ('dias_inmueble_estancado', 'Días publicado sin visitas para revisar el precio', 60.0, 'numero',
     'Criterio interno: días en mercado del sector',
     'Un inmueble disponible que lleva esto sin una sola visita casi nunca tiene un problema de difusión.', 240),
    ('dias_aviso_vencimiento', 'Horizonte de aviso de vencimientos', 60.0, 'numero',
     'Criterio interno',
     'Hasta cuántos días adelante mira el panel los contratos por vencer.', 250)
  ) as x(slug, nombre, valor, unidad, fuente, nota, orden)
 where exists (select 1 from public.rei_parameters p where p.company_id = c.id)
on conflict (company_id, slug) do nothing;
