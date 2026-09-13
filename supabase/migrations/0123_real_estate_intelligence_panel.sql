-- ===========================================================
-- 0123 · REAL ESTATE INTELLIGENCE — el panel
-- -----------------------------------------------------------
-- Devuelve la MISMA forma que `ci_resumen()` y que `resumen_modulo()`
-- —cifras, series, listas, alertas— para que la pantalla que ya sabe
-- dibujar un panel dibuje este sin aprender nada nuevo.
--
-- Lo que este panel responde, en el orden en que se pregunta:
--
--   1 · cómo va la comercialización     inventario, cierre, ticket
--   2 · dónde está la demanda           brecha por tipología
--   3 · qué canal trae y qué canal cierra
--   4 · qué se está desarrollando       pipeline y avance
--   5 · qué está torcido                las alertas
--
-- Y una decisión que atraviesa todo el archivo: LOS HUECOS DE DATO SE
-- CUENTAN Y SE AVISAN, no se rellenan. Un inmueble marcado vendido sin
-- fecha de venta no entra en la serie del mes —porque no se sabe qué
-- mes— y aparece en una alerta que dice cuántos son. El error que se
-- quiere evitar es exactamente el que trae la planilla de origen: una
-- gráfica de evolución con años en cero que se lee como "no hubo
-- actividad" cuando lo que falta es la fecha.
-- ===========================================================

create or replace function public.rei_resumen(p_company uuid, p_filtros jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_moneda text; v_desde date; v_hasta date;
  v_cifras jsonb; v_series jsonb; v_listas jsonb; v_alertas jsonb := '[]'::jsonb;
  v_muni text; v_tipo text; v_canal text;
  v_total int; v_disp int; v_vend int; v_cierre numeric;
  v_precio_m2 numeric; v_ticket numeric; v_dias numeric;
  v_compradores int; v_ya int; v_presupuesto numeric;
  v_oport int; v_sin_calificar int; v_desarrollos int; v_sin_etapa int;
  v_comision_pct numeric; v_ingresos numeric; v_comision numeric;
  v_sin_fecha int; v_sin_m2 int; v_peso numeric; v_criterios int;
  v_adelantos int; v_sin_garantia int;
begin
  if not public.has_company_level(p_company, 40) then return '{}'::jsonb; end if;

  select currency into v_moneda from public.companies where id = p_company;
  v_desde := coalesce((p_filtros->>'desde')::date,
                      date_trunc('month', current_date - interval '23 months')::date);
  v_hasta := coalesce((p_filtros->>'hasta')::date, date_trunc('month', current_date)::date);
  v_muni  := nullif(p_filtros->>'municipio', '');
  v_tipo  := nullif(p_filtros->>'tipo', '');
  v_canal := nullif(p_filtros->>'canal', '');

  v_comision_pct := public.rei_parametro(p_company, 'comision_intermediacion');

  -- ---------- inventario ----------
  select count(*),
         count(*) filter (where lower(commercial_status) = 'disponible'),
         count(*) filter (where lower(commercial_status) = 'vendido'),
         avg(price_m2),
         avg(coalesce(sale_price, list_price)) filter (where lower(commercial_status) = 'vendido'),
         avg(public.rei_dias_en_mercado(entry_date, sale_date, commercial_status)),
         count(*) filter (where lower(commercial_status) = 'vendido' and sale_date is null),
         count(*) filter (where price_m2 is null)
    into v_total, v_disp, v_vend, v_precio_m2, v_ticket, v_dias, v_sin_fecha, v_sin_m2
    from public.rei_properties
   where company_id = p_company and deleted_at is null
     and (v_muni  is null or city          = v_muni)
     and (v_tipo  is null or property_type = v_tipo)
     and (v_canal is null or channel       = v_canal);

  v_cierre := case when (v_vend + v_disp) > 0
                   then round(v_vend::numeric / (v_vend + v_disp) * 100, 1) end;

  -- ---------- demanda ----------
  select count(*) filter (where lower(client_status) = 'activo'),
         count(*) filter (where lower(client_status) in ('ya compro','ya compró','comprado')),
         avg(budget)
    into v_compradores, v_ya, v_presupuesto
    from public.rei_buyers
   where company_id = p_company and deleted_at is null
     and (v_muni is null or city        = v_muni)
     and (v_tipo is null or wanted_type = v_tipo);

  -- ---------- originación y desarrollo ----------
  select count(*) filter (where status <> 'descartada'),
         count(*) filter (where status <> 'descartada'
                            and not exists (select 1 from public.rei_opportunity_scores s
                                             where s.opportunity_id = o.id))
    into v_oport, v_sin_calificar
    from public.rei_opportunities o
   where o.company_id = p_company and o.deleted_at is null
     and (v_muni is null or o.municipality = v_muni);

  select count(*) filter (where status = 'activo'),
         count(*) filter (where status = 'activo' and stage_id is null)
    into v_desarrollos, v_sin_etapa
    from public.rei_developments
   where company_id = p_company and deleted_at is null
     and (v_muni is null or municipality = v_muni);

  -- ---------- comisión del tramo ----------
  -- Solo cuenta lo vendido CON fecha dentro del rango. Lo demás no se
  -- puede ubicar en el tiempo, y meterlo aquí sería inventar el mes.
  select coalesce(sum(coalesce(sale_price, list_price)), 0)
    into v_ingresos
    from public.rei_properties
   where company_id = p_company and deleted_at is null
     and lower(commercial_status) = 'vendido'
     and sale_date between v_desde and (v_hasta + interval '1 month' - interval '1 day')::date
     and (v_muni  is null or city          = v_muni)
     and (v_tipo  is null or property_type = v_tipo)
     and (v_canal is null or channel       = v_canal);
  v_comision := case when v_comision_pct is not null
                     then round(v_ingresos * v_comision_pct / 100, 2) end;

  -- ---------- adelantos de renta ----------
  select count(*),
         count(*) filter (where coalesce(insurance_status,'') = '' and not promissory_note)
    into v_adelantos, v_sin_garantia
    from public.rei_rental_advances
   where company_id = p_company and deleted_at is null
     and status not in ('rechazado','cancelado','liquidado');

  -- ---------- criterios ----------
  select count(*), coalesce(sum(weight_pct), 0) into v_criterios, v_peso
    from public.rei_criteria where company_id = p_company and active and deleted_at is null;

  -- ---------- las cifras ----------
  v_cifras := jsonb_build_array(
    public.ci_indicador('inmuebles','Inmuebles en base', v_total,'numero',
      'Inmuebles cargados que no están borrados, dentro del filtro',
      jsonb_build_array(public.ci_insumo('Disponibles', v_disp,'numero'),
                        public.ci_insumo('Vendidos', v_vend,'numero'))),

    public.ci_indicador('disponibles','Disponibles hoy', v_disp,'numero',
      'Inmuebles con estado comercial «disponible»', jsonb_build_array()),

    public.ci_indicador('vendidos','Vendidos (histórico)', v_vend,'numero',
      'Inmuebles con estado comercial «vendido», con fecha o sin ella',
      jsonb_build_array(public.ci_insumo('Sin fecha de venta', v_sin_fecha,'numero'))),

    public.ci_indicador('tasa_cierre','Tasa de cierre', v_cierre,'porcentaje',
      'Vendidos ÷ (vendidos + disponibles). Los estados intermedios no entran en ninguno de los dos lados.',
      jsonb_build_array(public.ci_insumo('Vendidos', v_vend,'numero'),
                        public.ci_insumo('Disponibles', v_disp,'numero'))),

    public.ci_indicador('precio_m2','Precio por m² promedio', round(v_precio_m2, 2),'dinero',
      'Promedio de precio publicado ÷ área, sobre los inmuebles que tienen las dos cifras',
      jsonb_build_array(public.ci_insumo('Sin precio por m²', v_sin_m2,'numero'))),

    public.ci_indicador('ticket','Ticket promedio de venta', round(v_ticket, 2),'dinero',
      'Promedio del precio de venta —o del publicado, cuando no se registró el de venta— de lo vendido',
      jsonb_build_array(public.ci_insumo('Ventas contadas', v_vend,'numero'))),

    public.ci_indicador('dias_mercado','Días promedio en mercado', round(v_dias, 0),'dias',
      'Días entre ingreso y venta en lo vendido; entre ingreso y hoy en lo que sigue disponible. '
      'Lo vendido sin fecha de venta no entra en el promedio.',
      jsonb_build_array(public.ci_insumo('Vendidos sin fecha', v_sin_fecha,'numero'))),

    public.ci_indicador('compradores','Compradores activos', v_compradores,'numero',
      'Personas en demanda con estado «activo»',
      jsonb_build_array(public.ci_insumo('Ya compraron', v_ya,'numero'))),

    public.ci_indicador('presupuesto','Presupuesto promedio del comprador',
      round(v_presupuesto, 2),'dinero',
      'Promedio del presupuesto declarado en la base de demanda', jsonb_build_array()),

    public.ci_indicador('comision','Comisión estimada del tramo', v_comision,'dinero',
      'Valor de lo vendido con fecha dentro del rango × comisión de intermediación',
      jsonb_build_array(public.ci_insumo('Ventas del tramo', v_ingresos,'dinero'),
                        public.ci_insumo('% de comisión', v_comision_pct,'porcentaje'))),

    public.ci_indicador('oportunidades','Oportunidades en evaluación', v_oport,'numero',
      'Predios cargados que no fueron descartados',
      jsonb_build_array(public.ci_insumo('Sin calificar', v_sin_calificar,'numero')))
      || jsonb_build_object('tono', case when v_sin_calificar > 0 then 'aviso' end),

    public.ci_indicador('desarrollos','Desarrollos activos', v_desarrollos,'numero',
      'Proyectos de desarrollo con estado «activo»',
      jsonb_build_array(public.ci_insumo('Sin etapa asignada', v_sin_etapa,'numero')))
  );

  -- ---------- las series ----------
  -- Mes a mes sobre el tramo pedido. Se generan los meses y se cuenta
  -- lo que cae en cada uno: así un mes sin movimiento sale en cero
  -- —que es un dato— en vez de desaparecer de la curva.
  select jsonb_build_array(
    jsonb_build_object('titulo','Captación y ventas, mes a mes',
      'formato','numero','leyenda', jsonb_build_array('Captados','Vendidos'),
      'puntos', coalesce((select jsonb_agg(jsonb_build_object(
                            'x', mes, 'y', cap, 'y2', ven, 'formato_x','mes') order by mes)
        from (
          select to_char(d,'YYYY-MM') as mes,
            (select count(*) from public.rei_properties p
              where p.company_id = p_company and p.deleted_at is null
                and date_trunc('month', p.entry_date) = d
                and (v_muni  is null or p.city          = v_muni)
                and (v_tipo  is null or p.property_type = v_tipo)
                and (v_canal is null or p.channel       = v_canal)) as cap,
            (select count(*) from public.rei_properties p
              where p.company_id = p_company and p.deleted_at is null
                and date_trunc('month', p.sale_date) = d
                and (v_muni  is null or p.city          = v_muni)
                and (v_tipo  is null or p.property_type = v_tipo)
                and (v_canal is null or p.channel       = v_canal)) as ven
            from generate_series(date_trunc('month', v_desde),
                                 date_trunc('month', v_hasta), interval '1 month') d
        ) s), '[]'::jsonb)),

    jsonb_build_object('titulo','Valor vendido por mes',
      'formato','dinero','leyenda', jsonb_build_array('Vendido'),
      'puntos', coalesce((select jsonb_agg(jsonb_build_object(
                            'x', mes, 'y', val, 'formato_x','mes') order by mes)
        from (
          select to_char(d,'YYYY-MM') as mes,
            (select coalesce(sum(coalesce(p.sale_price, p.list_price)), 0)
               from public.rei_properties p
              where p.company_id = p_company and p.deleted_at is null
                and date_trunc('month', p.sale_date) = d
                and (v_muni  is null or p.city          = v_muni)
                and (v_tipo  is null or p.property_type = v_tipo)
                and (v_canal is null or p.channel       = v_canal)) as val
            from generate_series(date_trunc('month', v_desde),
                                 date_trunc('month', v_hasta), interval '1 month') d
        ) s), '[]'::jsonb)))
    into v_series;

  -- ---------- las listas ----------
  select jsonb_build_array(
    -- La brecha es la cifra que justifica el módulo: dice qué hay que
    -- salir a captar, no cuánto se vendió.
    jsonb_build_object('titulo','Brecha oferta / demanda por tipología',
      'nota','Compradores que buscan cada tipo, menos inmuebles disponibles de ese tipo',
      'columnas', jsonb_build_array(
        jsonb_build_object('k','tipo','t','Tipología'),
        jsonb_build_object('k','inventario','t','En inventario','formato','numero'),
        jsonb_build_object('k','disponibles','t','Disponibles','formato','numero'),
        jsonb_build_object('k','compradores','t','Compradores','formato','numero'),
        jsonb_build_object('k','brecha','t','Brecha','formato','numero'),
        jsonb_build_object('k','precio_m2','t','Precio/m² oferta','formato','dinero'),
        jsonb_build_object('k','presupuesto','t','Presupuesto demanda','formato','dinero')),
      'filas', coalesce((select jsonb_agg(jsonb_build_object(
                  'tipo', tipo, 'inventario', inv, 'disponibles', disp,
                  'compradores', comp, 'brecha', comp - disp,
                  'precio_m2', round(pm2, 2), 'presupuesto', round(pres, 2))
                  order by (comp - disp) desc)
        from (
          select t.tipo,
                 (select count(*) from public.rei_properties p
                   where p.company_id = p_company and p.deleted_at is null
                     and p.property_type = t.tipo) as inv,
                 (select count(*) from public.rei_properties p
                   where p.company_id = p_company and p.deleted_at is null
                     and p.property_type = t.tipo
                     and lower(p.commercial_status) = 'disponible') as disp,
                 (select count(*) from public.rei_buyers b
                   where b.company_id = p_company and b.deleted_at is null
                     and b.wanted_type = t.tipo
                     and lower(b.client_status) = 'activo') as comp,
                 (select avg(p.price_m2) from public.rei_properties p
                   where p.company_id = p_company and p.deleted_at is null
                     and p.property_type = t.tipo) as pm2,
                 (select avg(b.budget) from public.rei_buyers b
                   where b.company_id = p_company and b.deleted_at is null
                     and b.wanted_type = t.tipo) as pres
            from (select property_type as tipo from public.rei_properties
                   where company_id = p_company and deleted_at is null and property_type is not null
                  union
                  select wanted_type from public.rei_buyers
                   where company_id = p_company and deleted_at is null and wanted_type is not null) t
        ) g), '[]'::jsonb)),

    jsonb_build_object('titulo','Efectividad por canal de captación',
      'nota','De lo que entró por cada canal, cuánto se vendió',
      'columnas', jsonb_build_array(
        jsonb_build_object('k','canal','t','Canal'),
        jsonb_build_object('k','captados','t','Captados','formato','numero'),
        jsonb_build_object('k','vendidos','t','Vendidos','formato','numero'),
        jsonb_build_object('k','efectividad','t','Efectividad','formato','porcentaje')),
      'filas', coalesce((select jsonb_agg(jsonb_build_object(
                  'canal', canal, 'captados', captados, 'vendidos', vendidos,
                  'efectividad', round(vendidos::numeric / captados * 100, 1))
                  order by captados desc)
        from (
          select coalesce(nullif(btrim(channel), ''), 'Sin registrar') as canal,
                 count(*) as captados,
                 count(*) filter (where lower(commercial_status) = 'vendido') as vendidos
            from public.rei_properties
           where company_id = p_company and deleted_at is null
             and (v_muni is null or city          = v_muni)
             and (v_tipo is null or property_type = v_tipo)
           group by 1
        ) c), '[]'::jsonb)),

    jsonb_build_object('titulo','Pipeline de desarrollo',
      'nota','Cada proyecto y en qué punto del proceso va',
      'columnas', jsonb_build_array(
        jsonb_build_object('k','proyecto','t','Proyecto'),
        jsonb_build_object('k','municipio','t','Municipio'),
        jsonb_build_object('k','etapa','t','Etapa'),
        jsonb_build_object('k','avance','t','Avance','formato','porcentaje'),
        jsonb_build_object('k','responsable','t','Responsable'),
        jsonb_build_object('k','hito','t','Próximo hito')),
      'filas', coalesce((select jsonb_agg(jsonb_build_object(
                  'proyecto', d.name, 'municipio', d.municipality,
                  'etapa', coalesce(e.name, 'Sin etapa'), 'avance', a.pct,
                  'responsable', d.manager, 'hito', d.next_milestone)
                  order by a.pct desc nulls last, d.name)
                from public.rei_developments d
                left join public.rei_stages e on e.id = d.stage_id
                cross join lateral (select public.rei_avance_etapa(d.id) as pct) a
               where d.company_id = p_company and d.deleted_at is null and d.status = 'activo'
                 and (v_muni is null or d.municipality = v_muni)), '[]'::jsonb)),

    jsonb_build_object('titulo','Oportunidades calificadas',
      'nota','Ordenadas por nota. La banda decide qué se estructura primero.',
      'columnas', jsonb_build_array(
        jsonb_build_object('k','oportunidad','t','Oportunidad'),
        jsonb_build_object('k','municipio','t','Municipio'),
        jsonb_build_object('k','area','t','Área m²','formato','numero'),
        jsonb_build_object('k','precio_m2','t','Precio/m²','formato','dinero'),
        jsonb_build_object('k','score','t','Nota','formato','numero'),
        jsonb_build_object('k','banda','t','Banda'),
        jsonb_build_object('k','decision','t','Decisión sugerida')),
      'filas', coalesce((select jsonb_agg(jsonb_build_object(
                  'oportunidad', o.name, 'municipio', o.municipality,
                  'area', o.area_m2, 'precio_m2', o.price_m2,
                  'score', (n.j->>'score')::numeric,
                  'banda', n.j->>'banda', 'decision', n.j->>'decision')
                  order by (n.j->>'score')::numeric desc nulls last, o.name)
                from public.rei_opportunities o
                -- La nota, una vez por oportunidad. Llamarla dentro de cada
                -- campo la calcularía cuatro veces para dibujar una fila.
                cross join lateral (select public.rei_score(o.id) as j) n
               where o.company_id = p_company and o.deleted_at is null
                 and o.status <> 'descartada'
                 and (v_muni is null or o.municipality = v_muni)), '[]'::jsonb)),

    jsonb_build_object('titulo','Próximos hitos',
      'nota','Lo que viene en los siguientes 90 días',
      'columnas', jsonb_build_array(
        jsonb_build_object('k','hito','t','Hito'),
        jsonb_build_object('k','proyecto','t','Proyecto'),
        jsonb_build_object('k','fecha','t','Fecha','formato','fecha'),
        jsonb_build_object('k','monto','t','Monto que condiciona','formato','dinero')),
      'filas', coalesce((select jsonb_agg(jsonb_build_object(
                  'hito', h.name, 'proyecto', d.name, 'fecha', h.due_date,
                  'monto', h.amount_conditioned) order by h.due_date)
                from public.rei_milestones h
                join public.rei_developments d on d.id = h.development_id
               where h.company_id = p_company and h.deleted_at is null
                 and d.deleted_at is null and h.status <> 'hecho'
                 and h.due_date between current_date and current_date + 90), '[]'::jsonb)))
    into v_listas;

  -- ---------- las alertas ----------
  -- Van primero en la pantalla y por eso importan más que el orden en
  -- que se calculan: lo bloqueante es lo que impide que una cifra
  -- signifique algo; lo de aviso es lo que hay que arreglar antes de
  -- sacarle conclusiones.
  if v_sin_fecha > 0 then
    v_alertas := v_alertas || public.ci_aviso('ventas_sin_fecha','bloqueante',
      v_sin_fecha || ' inmueble(s) vendidos sin fecha de venta',
      'No entran en la curva mensual ni en la comisión del tramo, y bajan el promedio de días en mercado sin aparecer. '
      'Un año en cero en la gráfica casi siempre es esto, no una caída de la actividad.');
  end if;
  if v_sin_m2 > 0 then
    v_alertas := v_alertas || public.ci_aviso('sin_precio_m2','aviso',
      v_sin_m2 || ' inmueble(s) sin precio por m²',
      'Les falta el área o el precio publicado. Quedan fuera de los comparables, que son la base con la que se fija el precio de un proyecto nuevo.');
  end if;
  if v_sin_calificar > 0 then
    v_alertas := v_alertas || public.ci_aviso('oportunidades_sin_calificar','aviso',
      v_sin_calificar || ' oportunidad(es) sin calificar',
      'Sin nota no tienen banda, y sin banda el pipeline se ordena por quién habló último.');
  end if;
  if v_criterios = 0 then
    v_alertas := v_alertas || public.ci_aviso('sin_criterios','bloqueante',
      'No hay criterios de calificación cargados',
      'Ninguna oportunidad puede tener nota. Cárgalos en la pestaña Criterios.');
  elsif v_peso <> 100 then
    v_alertas := v_alertas || public.ci_aviso('pesos_no_suman','aviso',
      'Los pesos de los criterios suman ' || trim(to_char(v_peso, 'FM999990.##')) || '%',
      'Las notas salen igual —se dividen por el peso repartido— pero dos oportunidades calificadas con repartos distintos no se pueden comparar.');
  end if;
  if v_sin_etapa > 0 then
    v_alertas := v_alertas || public.ci_aviso('desarrollos_sin_etapa','aviso',
      v_sin_etapa || ' desarrollo(s) activos sin etapa',
      'No tienen % de avance y no aparecen ordenados en el pipeline.');
  end if;
  if v_comision_pct is null then
    v_alertas := v_alertas || public.ci_aviso('sin_comision','aviso',
      'No hay comisión de intermediación configurada',
      'La comisión estimada queda vacía. Cárgala en Supuestos como «comision_intermediacion».');
  end if;
  if v_sin_garantia > 0 then
    v_alertas := v_alertas || public.ci_aviso('adelantos_sin_garantia','bloqueante',
      v_sin_garantia || ' adelanto(s) de renta sin póliza ni pagaré',
      'El adelanto se entrega hoy y el canon llega en cuotas: sin garantía, la vacancia o la mora del inquilino las cubre entera la sociedad.');
  end if;

  return jsonb_build_object(
    'moneda', v_moneda,
    'periodo', jsonb_build_object('desde', to_char(v_desde,'YYYY-MM'),
                                  'hasta', to_char(v_hasta,'YYYY-MM')),
    'cifras', v_cifras, 'series', v_series, 'listas', v_listas, 'alertas', v_alertas);
end $$;
comment on function public.rei_resumen(uuid, jsonb) is
  'Panel de Real Estate Intelligence. Misma forma que ci_resumen(): cifras con fórmula, series, listas y alertas.';
revoke execute on function public.rei_resumen(uuid, jsonb) from public, anon;
grant  execute on function public.rei_resumen(uuid, jsonb) to authenticated;
