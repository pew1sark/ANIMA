-- ===========================================================
-- 0132 · La capa de datos que faltaba: calidad, ciudad, búsqueda y drill-down
-- -----------------------------------------------------------
-- Cuatro secciones del documento de auditoría que comparten una
-- característica: no agregan nada que guardar. Leen lo que ya hay y lo
-- devuelven de una forma que permite actuar.
--
--   §48  Data Quality Engine     — qué falta, fila por fila
--   §14  Panel ciudad por ciudad — el mismo cuadro, por municipio
--   §46  Búsqueda global         — una caja, todas las entidades
--   §21  Drill-down              — de una cifra a los registros que la forman
--
-- UNA DECISIÓN QUE ATRAVIESA LAS CUATRO: ninguna inventa un umbral.
--
-- Lo que cuenta como «precio por m² imposible» no puede ser un número
-- escrito en la consulta. Un lote en Pamplona y una oficina en Bogotá
-- no comparten escala, y la plataforma sirve a empresas en dos países
-- con dos monedas. Así que el atípico se mide contra la MEDIANA de la
-- propia empresa, con un factor configurable: veinte veces por encima
-- o por debajo de lo que esa inmobiliaria cobra normalmente no es un
-- precio agresivo, es un dígito de más.
--
-- Eso hace que el detector funcione igual en COP y en CLP, y que una
-- empresa que vende terrenos rurales barrios enteros más baratos que
-- otra no vea toda su cartera marcada en rojo.
-- ===========================================================

-- ---------- el umbral del atípico ----------
insert into public.rei_parameters (company_id, slug, category, name, value, unit, source, notes, sort)
select c.id, 'factor_precio_m2_atipico', 'comercial',
       'Factor para marcar un precio por m² como atípico', 20.0, 'numero',
       'Criterio interno: se compara contra la mediana de la propia empresa, no contra un valor absoluto',
       'Un inmueble cuyo precio por m² esté más de este factor por encima o por debajo de la mediana de la empresa casi siempre tiene el área o el precio en la unidad equivocada. Subirlo marca menos; bajarlo marca más.',
       260
  from public.companies c
 where exists (select 1 from public.rei_parameters p where p.company_id = c.id)
on conflict (company_id, slug) do nothing;


-- ===========================================================
-- §48 · DATA QUALITY ENGINE
-- -----------------------------------------------------------
-- Dos cosas, y la segunda es la que sirve.
--
-- La primera es el `Completeness Score` que pide el documento: un
-- porcentaje por entidad. Está bien para saber si la cosa mejora o
-- empeora, y no sirve para arreglar nada.
--
-- La segunda es la lista de filas concretas: este inmueble, este
-- campo, este código. Es lo que convierte «calidad de dato 78%» en
-- veinte minutos de trabajo de alguien que sabe los hechos.
--
-- El orden de la lista no es casual: primero lo que rompe cifras
-- —una venta sin fecha se cae de todas las series—, después lo que
-- solo deja un hueco.
-- ===========================================================
create or replace function public.rei_calidad(p_company uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_entidades jsonb; v_arreglar jsonb; v_mediana numeric; v_factor numeric;
  v_props int; v_buyers int; v_leads int; v_deals int;
begin
  if not public.has_company_level(p_company, 40) then return '{}'::jsonb; end if;

  v_factor := public.rei_parametro(p_company, 'factor_precio_m2_atipico', 20);

  select percentile_cont(0.5) within group (order by price_m2)
    into v_mediana
    from public.rei_properties
   where company_id = p_company and deleted_at is null and price_m2 is not null and price_m2 > 0;

  select count(*) into v_props  from public.rei_properties where company_id = p_company and deleted_at is null;
  select count(*) into v_buyers from public.rei_buyers     where company_id = p_company and deleted_at is null;
  select count(*) into v_leads  from public.rei_leads      where company_id = p_company and deleted_at is null;
  select count(*) into v_deals  from public.rei_deals      where company_id = p_company and deleted_at is null;

  -- ---------- el porcentaje por entidad ----------
  -- La completitud es la media de cuántos de los campos que importan
  -- están llenos. «Los que importan» es una decisión, no una verdad:
  -- se eligen los que alimentan alguna cifra del panel. Un campo que
  -- no mueve ninguna cifra no debería bajar un score.
  v_entidades := jsonb_build_array(
    (select jsonb_build_object(
       'entidad', 'Inventario', 'tabla', 'rei_properties', 'filas', v_props,
       'completitud', case when v_props > 0 then round(avg(
           ((area_m2 is not null and area_m2 > 0)::int
          + (list_price is not null and list_price > 0)::int
          + (entry_date is not null)::int
          + (coalesce(btrim(city), '') <> '')::int
          + (coalesce(btrim(channel), '') <> '')::int
          + (owner_customer_id is not null)::int)::numeric / 6 * 100), 1) end,
       'faltantes', jsonb_build_array(
         jsonb_build_object('campo', 'Área',              'n', count(*) filter (where area_m2 is null or area_m2 = 0)),
         jsonb_build_object('campo', 'Precio publicado',  'n', count(*) filter (where list_price is null or list_price = 0)),
         jsonb_build_object('campo', 'Fecha de ingreso',  'n', count(*) filter (where entry_date is null)),
         jsonb_build_object('campo', 'Ciudad',            'n', count(*) filter (where coalesce(btrim(city), '') = '')),
         jsonb_build_object('campo', 'Canal de captación','n', count(*) filter (where coalesce(btrim(channel), '') = '')),
         jsonb_build_object('campo', 'Ficha de cliente',  'n', count(*) filter (where owner_customer_id is null))))
       from public.rei_properties where company_id = p_company and deleted_at is null),

    (select jsonb_build_object(
       'entidad', 'Demanda', 'tabla', 'rei_buyers', 'filas', v_buyers,
       'completitud', case when v_buyers > 0 then round(avg(
           ((coalesce(btrim(contact), '') <> '')::int
          + (budget is not null and budget > 0)::int
          + (coalesce(btrim(wanted_type), '') <> '')::int
          + (coalesce(btrim(sector), '') <> '')::int
          + (customer_id is not null)::int)::numeric / 5 * 100), 1) end,
       'faltantes', jsonb_build_array(
         jsonb_build_object('campo', 'Teléfono o correo', 'n', count(*) filter (where coalesce(btrim(contact), '') = '')),
         jsonb_build_object('campo', 'Presupuesto',       'n', count(*) filter (where budget is null or budget = 0)),
         jsonb_build_object('campo', 'Tipología buscada', 'n', count(*) filter (where coalesce(btrim(wanted_type), '') = '')),
         jsonb_build_object('campo', 'Sector de interés', 'n', count(*) filter (where coalesce(btrim(sector), '') = '')),
         jsonb_build_object('campo', 'Ficha de cliente',  'n', count(*) filter (where customer_id is null))))
       from public.rei_buyers where company_id = p_company and deleted_at is null),

    (select jsonb_build_object(
       'entidad', 'Leads', 'tabla', 'rei_leads', 'filas', v_leads,
       'completitud', case when v_leads > 0 then round(avg(
           ((coalesce(btrim(contact), '') <> '')::int
          + (broker_id is not null)::int
          + (coalesce(btrim(source), '') <> '')::int
          + (next_action_date is not null or stage in ('ganado','perdido'))::int)::numeric / 4 * 100), 1) end,
       'faltantes', jsonb_build_array(
         jsonb_build_object('campo', 'Teléfono o correo', 'n', count(*) filter (where coalesce(btrim(contact), '') = '')),
         jsonb_build_object('campo', 'Responsable',       'n', count(*) filter (where broker_id is null)),
         jsonb_build_object('campo', 'Canal',             'n', count(*) filter (where coalesce(btrim(source), '') = '')),
         jsonb_build_object('campo', 'Próxima acción',    'n', count(*) filter (where next_action_date is null and stage not in ('ganado','perdido')))))
       from public.rei_leads where company_id = p_company and deleted_at is null),

    (select jsonb_build_object(
       'entidad', 'Negociaciones', 'tabla', 'rei_deals', 'filas', v_deals,
       'completitud', case when v_deals > 0 then round(avg(
           ((property_value is not null and property_value > 0)::int
          + (commission_pct is not null or commission_amount is not null)::int
          + (broker_id is not null)::int
          + (expected_close_date is not null or stage in ('ganado','perdido'))::int
          + (property_id is not null)::int)::numeric / 5 * 100), 1) end,
       'faltantes', jsonb_build_array(
         jsonb_build_object('campo', 'Valor del inmueble', 'n', count(*) filter (where property_value is null or property_value = 0)),
         jsonb_build_object('campo', 'Comisión',           'n', count(*) filter (where commission_pct is null and commission_amount is null)),
         jsonb_build_object('campo', 'Responsable',        'n', count(*) filter (where broker_id is null)),
         jsonb_build_object('campo', 'Cierre estimado',    'n', count(*) filter (where expected_close_date is null and stage not in ('ganado','perdido'))),
         jsonb_build_object('campo', 'Inmueble',           'n', count(*) filter (where property_id is null))))
       from public.rei_deals where company_id = p_company and deleted_at is null)
  );

  -- ---------- las filas que hay que tocar ----------
  -- `gravedad` ordena: 1 rompe cifras, 2 las distorsiona, 3 deja un
  -- hueco. La pantalla no reordena; muestra en este orden porque este
  -- es el orden en que conviene arreglarlo.
  select coalesce(jsonb_agg(x.fila order by x.gravedad, x.codigo), '[]'::jsonb)
    into v_arreglar
    from (
      -- Una venta sin fecha no se puede ubicar en ningún mes: se cae de
      -- la curva mensual, del ticket promedio y de la comisión del
      -- período. Es el hueco más caro de todo el modelo.
      select 1 gravedad, coalesce(p.code, p.owner_name) codigo,
             jsonb_build_object(
               'gravedad', 1, 'entidad', 'Inventario', 'tabla', 'rei_properties',
               'codigo', coalesce(p.code, '—'), 'nombre', p.owner_name,
               'ciudad', coalesce(p.city, '—'),
               'problema', 'Marcado vendido sin fecha de venta',
               'efecto', 'No entra en la curva mensual, ni en el ticket promedio, ni en la comisión del período') fila
        from public.rei_properties p
       where p.company_id = p_company and p.deleted_at is null
         and lower(p.commercial_status) = 'vendido' and p.sale_date is null

      union all

      -- Un precio por m² a veinte veces la mediana de la propia empresa
      -- no es un precio: es el área o el precio en otra unidad. Y como
      -- el precio/m² se deriva, arrastra el comparable del municipio.
      select 2, coalesce(p.code, p.owner_name),
             jsonb_build_object(
               'gravedad', 2, 'entidad', 'Inventario', 'tabla', 'rei_properties',
               'codigo', coalesce(p.code, '—'), 'nombre', p.owner_name,
               'ciudad', coalesce(p.city, '—'),
               'problema', 'Precio por m² inverosímil: ' || to_char(round(p.price_m2), 'FM999G999G999G990')
                           || ' contra una mediana de ' || to_char(round(v_mediana), 'FM999G999G999G990'),
               'efecto', 'Distorsiona el comparable de precio por m² de todo su municipio')
        from public.rei_properties p
       where p.company_id = p_company and p.deleted_at is null
         and v_mediana is not null and v_mediana > 0 and p.price_m2 is not null and p.price_m2 > 0
         and (p.price_m2 > v_mediana * v_factor or p.price_m2 < v_mediana / v_factor)

      union all

      -- Sin área o sin precio no hay precio por m², y sin precio por m²
      -- el inmueble no entra en ningún comparable.
      select 2, coalesce(p.code, p.owner_name),
             jsonb_build_object(
               'gravedad', 2, 'entidad', 'Inventario', 'tabla', 'rei_properties',
               'codigo', coalesce(p.code, '—'), 'nombre', p.owner_name,
               'ciudad', coalesce(p.city, '—'),
               'problema', case when p.area_m2 is null or p.area_m2 = 0
                                then 'Sin área' else 'Sin precio publicado' end,
               'efecto', 'Queda fuera del precio por m² y de todos los comparables')
        from public.rei_properties p
       where p.company_id = p_company and p.deleted_at is null
         and ((p.area_m2 is null or p.area_m2 = 0) or (p.list_price is null or p.list_price = 0))

      union all

      -- Sin fecha de ingreso no hay días en mercado ni curva de captación.
      select 3, coalesce(p.code, p.owner_name),
             jsonb_build_object(
               'gravedad', 3, 'entidad', 'Inventario', 'tabla', 'rei_properties',
               'codigo', coalesce(p.code, '—'), 'nombre', p.owner_name,
               'ciudad', coalesce(p.city, '—'),
               'problema', 'Sin fecha de ingreso',
               'efecto', 'No cuenta en días en mercado ni en la curva de captación')
        from public.rei_properties p
       where p.company_id = p_company and p.deleted_at is null and p.entry_date is null

      union all

      -- Un lead abierto sin próxima acción es el control principal del
      -- módulo, y por eso también es un problema de calidad de dato.
      select 1, coalesce(l.code, l.name),
             jsonb_build_object(
               'gravedad', 1, 'entidad', 'Leads', 'tabla', 'rei_leads',
               'codigo', coalesce(l.code, '—'), 'nombre', l.name,
               'ciudad', coalesce(l.city, '—'),
               'problema', 'Abierto sin próxima acción',
               'efecto', 'Nadie se comprometió a volver a tocarlo')
        from public.rei_leads l
       where l.company_id = p_company and l.deleted_at is null
         and l.stage not in ('ganado','perdido') and l.next_action_date is null

      union all

      select 1, coalesce(d.code, d.name),
             jsonb_build_object(
               'gravedad', 1, 'entidad', 'Negociaciones', 'tabla', 'rei_deals',
               'codigo', coalesce(d.code, '—'), 'nombre', d.name,
               'ciudad', coalesce(d.city, '—'),
               'problema', 'Ganada sin fecha de cierre',
               'efecto', 'No entra en la comisión de ningún mes')
        from public.rei_deals d
       where d.company_id = p_company and d.deleted_at is null
         and d.stage = 'ganado' and d.closed_at is null
      limit 400
    ) x;

  return jsonb_build_object(
    'entidades', v_entidades,
    'arreglar',  v_arreglar,
    'mediana_precio_m2', round(coalesce(v_mediana, 0)),
    'factor_atipico', v_factor,
    'generado', now());
end $$;
comment on function public.rei_calidad(uuid) is
  'Brokerage · §48. Completitud por entidad y, sobre todo, la lista de filas concretas que hay que arreglar, ordenada por lo que rompe cifras primero.';
revoke execute on function public.rei_calidad(uuid) from public, anon;
grant  execute on function public.rei_calidad(uuid) to authenticated;


-- ===========================================================
-- §14 · PANEL CIUDAD POR CIUDAD
-- -----------------------------------------------------------
-- El mismo cuadro del panel comercial, abierto por municipio. Es lo
-- que permite saber si el problema es Pamplona o es el equipo.
--
-- `canon_m2` sale de cruzar el canon del contrato con el área del
-- inmueble, y es la cifra que más dice de un mercado de arriendo: dos
-- municipios con el mismo canon medio y áreas distintas no son el
-- mismo negocio.
--
-- La lista de municipios sale de LOS DATOS y no de un catálogo. La
-- auditoría propone cuatro; el inventario real tiene otros, y uno de
-- los propuestos no tiene ni un inmueble. Un panel que muestra la
-- lista deseada en vez de la real no es un panel.
-- ===========================================================
create or replace function public.rei_ciudades(p_company uuid, p_filtros jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_ini date; v_fin date; v_moneda text; v_comision numeric;
begin
  if not public.has_company_level(p_company, 40) then return '{}'::jsonb; end if;

  select currency into v_moneda from public.companies where id = p_company;
  v_ini := date_trunc('month', coalesce((p_filtros->>'desde')::date, current_date))::date;
  v_fin := (date_trunc('month', coalesce((p_filtros->>'hasta')::date, current_date))
            + interval '1 month' - interval '1 day')::date;
  v_comision := public.rei_parametro(p_company, 'comision_intermediacion', 3);

  return jsonb_build_object(
    'moneda', v_moneda,
    'periodo', jsonb_build_object('desde', v_ini, 'hasta', v_fin),
    'ciudades', coalesce((
      select jsonb_agg(f order by f->>'orden')
        from (
          select jsonb_build_object(
                   'orden',        lpad((100000 - t.inventario)::text, 6, '0'),
                   'ciudad',       t.ciudad,
                   'inventario',   t.inventario,
                   'disponibles',  t.disponibles,
                   'captaciones',  t.captaciones,
                   'cierres',      t.cierres,
                   'comision',     t.comision,
                   'dias_mercado', t.dias_mercado,
                   'precio_m2',    t.precio_m2,
                   'canon_m2',     kn.canon_m2,
                   'leads',        coalesce(l.n, 0),
                   'visitas',      coalesce(v.n, 0),
                   'pipeline',     coalesce(d.ponderado, 0),
                   'oportunidades',coalesce(o.n, 0)) f
            from (
              select coalesce(nullif(btrim(p.city), ''), 'Sin ciudad') ciudad,
                     count(*) inventario,
                     count(*) filter (where lower(p.commercial_status) = 'disponible') disponibles,
                     count(*) filter (where p.entry_date between v_ini and v_fin) captaciones,
                     count(*) filter (where lower(p.commercial_status) = 'vendido'
                                        and p.sale_date between v_ini and v_fin) cierres,
                     round(coalesce(sum(coalesce(p.sale_price, p.list_price))
                       filter (where lower(p.commercial_status) = 'vendido'
                                 and p.sale_date between v_ini and v_fin), 0) * v_comision / 100, 2) comision,
                     round(avg(public.rei_dias_en_mercado(p.entry_date, p.sale_date, p.commercial_status))) dias_mercado,
                     round(avg(p.price_m2)) precio_m2
                from public.rei_properties p
               where p.company_id = p_company and p.deleted_at is null
               group by 1) t
            /* El canon por m² se agrupa aparte y se une, no se calcula
               dentro del grupo de arriba: una subconsulta correlacionada
               contra una columna agrupada no es válida, y aunque lo fuera
               recorrería los contratos una vez por municipio. */
            left join (select coalesce(nullif(btrim(p2.city), ''), 'Sin ciudad') ciudad,
                              round(avg(c.monthly_amount / nullif(p2.area_m2, 0))) canon_m2
                         from public.rei_contracts c
                         join public.rei_properties p2 on p2.id = c.property_id
                        where c.company_id = p_company and c.deleted_at is null
                          and c.contract_type = 'arriendo' and c.status in ('vigente','renovado')
                          and c.monthly_amount > 0 and p2.area_m2 > 0
                        group by 1) kn on kn.ciudad = t.ciudad
            left join (select coalesce(nullif(btrim(city), ''), 'Sin ciudad') ciudad, count(*) n
                         from public.rei_leads
                        where company_id = p_company and deleted_at is null
                          and created_at >= v_ini and created_at < v_fin + 1
                        group by 1) l on l.ciudad = t.ciudad
            left join (select coalesce(nullif(btrim(pr.city), ''), 'Sin ciudad') ciudad, count(*) n
                         from public.rei_visits vi
                         join public.rei_properties pr on pr.id = vi.property_id
                        where vi.company_id = p_company and vi.deleted_at is null
                          and vi.status = 'realizada' and vi.done_at >= v_ini and vi.done_at < v_fin + 1
                        group by 1) v on v.ciudad = t.ciudad
            left join (select coalesce(nullif(btrim(city), ''), 'Sin ciudad') ciudad,
                              sum(weighted_revenue) ponderado
                         from public.rei_deals
                        where company_id = p_company and deleted_at is null
                          and stage not in ('ganado','perdido')
                        group by 1) d on d.ciudad = t.ciudad
            left join (select coalesce(nullif(btrim(municipality), ''), 'Sin ciudad') ciudad, count(*) n
                         from public.rei_opportunities
                        where company_id = p_company and deleted_at is null and status <> 'descartada'
                        group by 1) o on o.ciudad = t.ciudad
        ) s), '[]'::jsonb),
    'generado', now());
end $$;
comment on function public.rei_ciudades(uuid, jsonb) is
  'Brokerage · §14. El cuadro por municipio, con la lista que sale de los datos y no de un catálogo. Incluye canon por m², que es lo que distingue dos mercados de arriendo.';
revoke execute on function public.rei_ciudades(uuid, jsonb) from public, anon;
grant  execute on function public.rei_ciudades(uuid, jsonb) to authenticated;


-- ===========================================================
-- §46 · BÚSQUEDA GLOBAL
-- -----------------------------------------------------------
-- Una caja, todas las entidades, resultado agrupado. Hoy cada pestaña
-- tiene su buscador, lo que obliga a saber DÓNDE está algo antes de
-- poder buscarlo — y un teléfono que llama no dice de qué pestaña es.
--
-- Por eso el teléfono se busca por dígitos y no por texto: en esta
-- base hay contactos escritos «320 229 6027», «3202296027» y
-- «320-2296027», y las tres son la misma persona. Comparar el texto
-- tal cual encontraría una de las tres.
-- ===========================================================
create or replace function public.rei_buscar(p_company uuid, p_texto text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_t text; v_d text; v_r jsonb := '[]'::jsonb;
begin
  if not public.has_company_level(p_company, 40) then return '[]'::jsonb; end if;

  v_t := '%' || btrim(coalesce(p_texto, '')) || '%';
  -- Solo dígitos: si lo que se escribió tiene al menos cuatro, se
  -- busca también como teléfono.
  v_d := regexp_replace(coalesce(p_texto, ''), '[^0-9]', '', 'g');
  if length(btrim(coalesce(p_texto, ''))) < 2 then return '[]'::jsonb; end if;

  with hallado as (
    -- La ficha de cliente guarda la unidad territorial en `comuna`, que
    -- es como se llama en Chile: la plataforma nació allá. En Colombia
    -- la pantalla la rotula «municipio», y aquí se lee la columna real.
    select 'Clientes' entidad, 1 orden, c.id, coalesce(c.name, '—') titulo,
           concat_ws(' · ', nullif(c.phone, ''), nullif(c.email, ''), nullif(c.comuna, '')) detalle
      from public.customers c
     where c.company_id = p_company
       and (c.name ilike v_t or c.email ilike v_t or c.comuna ilike v_t
            or (length(v_d) >= 4
                and regexp_replace(concat_ws(' ', c.phone, c.whatsapp), '[^0-9]', '', 'g') like '%' || v_d || '%'))

    union all
    select 'Inventario', 2, p.id, concat_ws(' · ', nullif(p.code, ''), p.owner_name),
           concat_ws(' · ', nullif(p.city, ''), nullif(p.neighborhood, ''), p.property_type,
                     case when p.area_m2 > 0 then round(p.area_m2)::text || ' m²' end)
      from public.rei_properties p
     where p.company_id = p_company and p.deleted_at is null
       and (p.owner_name ilike v_t or p.code ilike v_t or p.neighborhood ilike v_t or p.city ilike v_t
            or (length(v_d) >= 4 and regexp_replace(coalesce(p.contact, ''), '[^0-9]', '', 'g') like '%' || v_d || '%'))

    union all
    select 'Demanda', 3, b.id, concat_ws(' · ', nullif(b.code, ''), b.name),
           concat_ws(' · ', nullif(b.sector, ''), nullif(b.wanted_type, ''), nullif(b.city, ''))
      from public.rei_buyers b
     where b.company_id = p_company and b.deleted_at is null
       and (b.name ilike v_t or b.code ilike v_t or b.sector ilike v_t
            or (length(v_d) >= 4 and regexp_replace(coalesce(b.contact, ''), '[^0-9]', '', 'g') like '%' || v_d || '%'))

    union all
    select 'Leads', 4, l.id, concat_ws(' · ', nullif(l.code, ''), l.name),
           concat_ws(' · ', l.stage, nullif(l.city, ''), nullif(l.source, ''))
      from public.rei_leads l
     where l.company_id = p_company and l.deleted_at is null
       and (l.name ilike v_t or l.code ilike v_t
            or (length(v_d) >= 4 and regexp_replace(coalesce(l.contact, ''), '[^0-9]', '', 'g') like '%' || v_d || '%'))

    union all
    select 'Negociaciones', 5, d.id, concat_ws(' · ', nullif(d.code, ''), d.name),
           concat_ws(' · ', d.stage, d.deal_type, nullif(d.city, ''))
      from public.rei_deals d
     where d.company_id = p_company and d.deleted_at is null
       and (d.name ilike v_t or d.code ilike v_t)

    union all
    select 'Contratos', 6, k.id, concat_ws(' · ', nullif(k.code, ''), k.name),
           concat_ws(' · ', k.contract_type, k.status,
                     case when k.end_date is not null then 'vence ' || to_char(k.end_date, 'DD-MM-YYYY') end)
      from public.rei_contracts k
     where k.company_id = p_company and k.deleted_at is null
       and (k.name ilike v_t or k.code ilike v_t)

    union all
    select 'Oportunidades', 7, o.id, concat_ws(' · ', nullif(o.code, ''), o.name),
           concat_ws(' · ', nullif(o.municipality, ''), o.status, nullif(o.registration_number, ''))
      from public.rei_opportunities o
     where o.company_id = p_company and o.deleted_at is null
       and (o.name ilike v_t or o.code ilike v_t or o.municipality ilike v_t or o.registration_number ilike v_t)

    union all
    select 'Desarrollos', 8, s.id, concat_ws(' · ', nullif(s.code, ''), s.name),
           concat_ws(' · ', nullif(s.municipality, ''), s.product, s.status)
      from public.rei_developments s
     where s.company_id = p_company and s.deleted_at is null
       and (s.name ilike v_t or s.code ilike v_t or s.municipality ilike v_t)
  ),
  -- Veinte por entidad. Quien busca «Pamplona» no quiere doscientas
  -- filas: quiere saber en qué entidades hay algo y abrir una.
  recortado as (
    select *, row_number() over (partition by entidad order by titulo) rn,
           count(*) over (partition by entidad) total
      from hallado)
  select coalesce(jsonb_agg(g.grupo order by g.orden), '[]'::jsonb) into v_r
    from (select orden, entidad,
                 jsonb_build_object(
                   'entidad', entidad, 'total', max(total),
                   'resultados', jsonb_agg(jsonb_build_object(
                     'id', id, 'titulo', titulo, 'detalle', nullif(detalle, ''))
                     order by titulo)) grupo
            from recortado where rn <= 20
           group by orden, entidad) g;

  return v_r;
end $$;
comment on function public.rei_buscar(uuid, text) is
  'Brokerage · §46. Una caja para ocho entidades, agrupado. El teléfono se compara por dígitos porque el mismo número está escrito de tres formas distintas.';
revoke execute on function public.rei_buscar(uuid, text) from public, anon;
grant  execute on function public.rei_buscar(uuid, text) to authenticated;


-- ===========================================================
-- §21 · DRILL-DOWN
-- -----------------------------------------------------------
-- «34 leads → los 34 registros». Hoy una cifra del panel abre su
-- fórmula y sus insumos, que es más de lo que suele ofrecer un panel
-- y sigue sin ser lo que pide el documento: los registros.
--
-- Esta función recibe la MISMA clave que devuelve `rei_comercial()` y
-- los mismos filtros, y devuelve las filas que la forman. Que
-- compartan clave y filtros no es cosmético: es lo que garantiza que
-- el detalle sume exactamente la cifra. Un drill-down que devuelve
-- una lista parecida es peor que no tenerlo, porque nadie vuelve a
-- creer el número.
-- ===========================================================
create or replace function public.rei_registros(
  p_company uuid, p_clave text, p_filtros jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_ini date; v_fin date; v_ciudad text; v_broker uuid; v_filas jsonb; v_titulo text;
begin
  if not public.has_company_level(p_company, 40) then return '{}'::jsonb; end if;

  v_ini    := date_trunc('month', coalesce((p_filtros->>'desde')::date, current_date))::date;
  v_fin    := (date_trunc('month', coalesce((p_filtros->>'hasta')::date, current_date))
               + interval '1 month' - interval '1 day')::date;
  v_ciudad := nullif(p_filtros->>'ciudad', '');
  v_broker := nullif(p_filtros->>'broker', '')::uuid;

  if p_clave in ('leads', 'sin_accion', 'conversion') then
    v_titulo := case p_clave when 'leads' then 'Leads creados en el tramo'
                             when 'sin_accion' then 'Abiertos sin próxima acción'
                             else 'Leads del tramo' end;
    select coalesce(jsonb_agg(jsonb_build_object(
             'codigo', coalesce(l.code, '—'), 'nombre', l.name,
             'etapa', l.stage, 'ciudad', coalesce(l.city, '—'),
             'contacto', coalesce(l.contact, '—'),
             'responsable', coalesce(nullif(btrim(pf.full_name), ''), pf.email, 'Sin asignar'),
             'cuando', to_char(l.created_at, 'YYYY-MM-DD')) order by l.created_at desc), '[]'::jsonb)
      into v_filas
      from public.rei_leads l
      left join public.profiles pf on pf.id = l.broker_id
     where l.company_id = p_company and l.deleted_at is null
       and (v_ciudad is null or l.city      = v_ciudad)
       and (v_broker is null or l.broker_id = v_broker)
       and (p_clave <> 'sin_accion'
            or (l.stage not in ('ganado','perdido') and l.next_action_date is null))
       and (p_clave =  'sin_accion'
            or (l.created_at >= v_ini and l.created_at < v_fin + 1));

  elsif p_clave in ('cierres', 'comision') then
    v_titulo := 'Negociaciones ganadas en el tramo';
    select coalesce(jsonb_agg(jsonb_build_object(
             'codigo', coalesce(d.code, '—'), 'nombre', d.name,
             'etapa', d.stage, 'ciudad', coalesce(d.city, '—'),
             'contacto', coalesce(cu.name, '—'),
             'responsable', coalesce(nullif(btrim(pf.full_name), ''), pf.email, 'Sin asignar'),
             'cuando', to_char(d.closed_at, 'YYYY-MM-DD'),
             'monto', d.expected_revenue) order by d.closed_at desc), '[]'::jsonb)
      into v_filas
      from public.rei_deals d
      left join public.profiles pf  on pf.id = d.broker_id
      left join public.customers cu on cu.id = d.customer_id
     where d.company_id = p_company and d.deleted_at is null
       and d.stage = 'ganado' and d.closed_at >= v_ini and d.closed_at < v_fin + 1
       and (v_ciudad is null or d.city      = v_ciudad)
       and (v_broker is null or d.broker_id = v_broker);

  elsif p_clave = 'forecast' then
    v_titulo := 'Negociaciones abiertas, con su ponderado';
    select coalesce(jsonb_agg(jsonb_build_object(
             'codigo', coalesce(d.code, '—'), 'nombre', d.name,
             'etapa', d.stage, 'ciudad', coalesce(d.city, '—'),
             'contacto', coalesce(cu.name, '—'),
             'responsable', coalesce(nullif(btrim(pf.full_name), ''), pf.email, 'Sin asignar'),
             'cuando', to_char(d.expected_close_date, 'YYYY-MM-DD'),
             'monto', d.weighted_revenue) order by d.weighted_revenue desc), '[]'::jsonb)
      into v_filas
      from public.rei_deals d
      left join public.profiles pf  on pf.id = d.broker_id
      left join public.customers cu on cu.id = d.customer_id
     where d.company_id = p_company and d.deleted_at is null
       and d.stage not in ('ganado','perdido')
       and (v_ciudad is null or d.city      = v_ciudad)
       and (v_broker is null or d.broker_id = v_broker);

  elsif p_clave = 'visitas' then
    v_titulo := 'Visitas realizadas en el tramo';
    select coalesce(jsonb_agg(jsonb_build_object(
             'codigo', coalesce(v.code, '—'),
             'nombre', coalesce(pr.code, pr.owner_name, 'inmueble'),
             'etapa', v.status, 'ciudad', coalesce(pr.city, '—'),
             'contacto', coalesce(l.name, cu.name, '—'),
             'responsable', coalesce(nullif(btrim(pf.full_name), ''), pf.email, 'Sin asignar'),
             'cuando', to_char(v.done_at, 'YYYY-MM-DD')) order by v.done_at desc), '[]'::jsonb)
      into v_filas
      from public.rei_visits v
      left join public.rei_properties pr on pr.id = v.property_id
      left join public.rei_leads l       on l.id  = v.lead_id
      left join public.customers cu      on cu.id = v.customer_id
      left join public.profiles pf       on pf.id = v.broker_id
     where v.company_id = p_company and v.deleted_at is null
       and v.status = 'realizada' and v.done_at >= v_ini and v.done_at < v_fin + 1
       and (v_ciudad is null or pr.city     = v_ciudad)
       and (v_broker is null or v.broker_id = v_broker);

  elsif p_clave = 'captaciones' then
    v_titulo := 'Inmuebles captados en el tramo';
    select coalesce(jsonb_agg(jsonb_build_object(
             'codigo', coalesce(p.code, '—'), 'nombre', p.owner_name,
             'etapa', p.commercial_status, 'ciudad', coalesce(p.city, '—'),
             'contacto', coalesce(p.contact, '—'),
             'responsable', coalesce(p.channel, '—'),
             'cuando', to_char(p.entry_date, 'YYYY-MM-DD'),
             'monto', p.list_price) order by p.entry_date desc), '[]'::jsonb)
      into v_filas
      from public.rei_properties p
     where p.company_id = p_company and p.deleted_at is null
       and p.entry_date between v_ini and v_fin
       and (v_ciudad is null or p.city = v_ciudad);

  else
    -- Una cifra sin detalle definido devuelve vacío con su motivo, en
    -- vez de una lista de otra cosa.
    return jsonb_build_object('clave', p_clave, 'titulo', null, 'filas', '[]'::jsonb,
      'nota', 'Esta cifra se calcula sobre varias entidades a la vez y no tiene una lista única detrás.');
  end if;

  return jsonb_build_object('clave', p_clave, 'titulo', v_titulo, 'filas', v_filas);
end $$;
comment on function public.rei_registros(uuid, text, jsonb) is
  'Brokerage · §21. Los registros detrás de una cifra del panel. Comparte clave y filtros con rei_comercial() para que el detalle sume exactamente el número.';
revoke execute on function public.rei_registros(uuid, text, jsonb) from public, anon;
grant  execute on function public.rei_registros(uuid, text, jsonb) to authenticated;
