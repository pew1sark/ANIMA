-- ===========================================================
-- 0105 · Ninguna cifra del panel sin su fórmula
-- -----------------------------------------------------------
-- Las tarjetas del panel mostraban un número y nada más. El encargo
-- es explícito en lo contrario: "las tarjetas deben permitir abrir
-- el detalle que origina cada cifra" y "mostrar siempre la fórmula y
-- los datos que originan cada resultado".
--
-- Así que `ci_resumen()` deja de devolver `{etiqueta, valor}` y pasa
-- a devolver el MISMO objeto que los indicadores del modelo:
--
--   {clave, etiqueta, valor, formato, formula, insumos[]}
--
-- más `tono` y `nota`, que son lo que la tarjeta necesita para
-- pintarse. Una cifra del panel se abre y se lee de qué está hecha,
-- sin que la pantalla tenga que reconstruir la explicación —que es
-- justo donde una explicación se desincroniza del cálculo.
--
-- Esta migración consolida además lo que venían corrigiendo 0100b,
-- 0103 y 0103b: la lista de proyectos filtrados como función y no
-- como tabla temporal, y proyectado y real midiendo el mismo tramo
-- de tiempo. Es la definición completa y vigente de `ci_resumen()`.
-- ===========================================================

create or replace function public.ci_resumen(p_company uuid, p_filtros jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_moneda text; v_desde date; v_hasta date; v_hoy date := date_trunc('month', current_date)::date;
  v_cifras jsonb; v_series jsonb; v_listas jsonb; v_alertas jsonb := '[]'::jsonb;
  v_solicitado numeric; v_comprometido numeric; v_utilizado numeric;
  v_ing_proy numeric; v_ing_real numeric; v_ebitda numeric;
  v_presu numeric; v_real numeric;
  v_proyectos int; v_activos int; v_riesgo int; v_sin_tasa int; v_sin_modelo int;
  v_warn numeric; v_crit numeric; v_desv numeric;
begin
  if not public.has_company_level(p_company, 40) then return '{}'::jsonb; end if;

  select currency into v_moneda from public.companies where id = p_company;
  v_desde := coalesce((p_filtros->>'desde')::date, date_trunc('month', current_date - interval '11 months')::date);
  v_hasta := coalesce((p_filtros->>'hasta')::date, date_trunc('month', current_date + interval '11 months')::date);

  select warn_pct, critical_pct into v_warn, v_crit
    from public.ci_thresholds where company_id = p_company and kind = 'general';
  v_warn := coalesce(v_warn, 10); v_crit := coalesce(v_crit, 20);

  select coalesce(sum(public.ci_convertir(p_company, capital_required,  currency, v_moneda)), 0),
         coalesce(sum(public.ci_convertir(p_company, capital_committed, currency, v_moneda)), 0),
         count(*),
         count(*) filter (where status not in ('cerrado','rechazado','pausado','borrador')),
         count(*) filter (where risk_level = 'alto' or status = 'pausado'),
         count(*) filter (where currency <> v_moneda
                            and public.ci_convertir(p_company, 1, currency, v_moneda) is null),
         count(*) filter (where modelo is null)
    into v_solicitado, v_comprometido, v_proyectos, v_activos, v_riesgo, v_sin_tasa, v_sin_modelo
    from public.ci_proyectos_filtrados(p_company, p_filtros);

  select coalesce(sum(public.ci_convertir(p_company, a.paid_amount, a.currency, v_moneda, a.period)), 0)
    into v_utilizado
    from public.ci_actuals a
    join public.ci_proyectos_filtrados(p_company, p_filtros) t on t.id = a.project_id
   where a.kind = 'inversion'
     and (p_filtros->>'unidad' is null or a.business_unit_id = (p_filtros->>'unidad')::uuid);

  -- Real y proyectado se cortan los dos en el mes en curso. Comparar
  -- 24 meses de presupuesto contra 8 de ejecución da una desviación
  -- correcta que responde una pregunta que nadie hizo.
  select coalesce(sum(public.ci_convertir(p_company, a.actual_amount, a.currency, v_moneda, a.period))
                  filter (where a.kind = 'ingreso'), 0),
         coalesce(sum(public.ci_convertir(p_company, a.actual_amount, a.currency, v_moneda, a.period))
                  filter (where a.kind = 'ingreso'), 0)
       - coalesce(sum(public.ci_convertir(p_company, a.actual_amount, a.currency, v_moneda, a.period))
                  filter (where a.kind in ('costo_directo','gasto_operativo')), 0),
         coalesce(sum(public.ci_convertir(p_company, a.actual_amount, a.currency, v_moneda, a.period))
                  filter (where a.kind <> 'inversion'), 0)
    into v_ing_real, v_ebitda, v_real
    from public.ci_actuals a
    join public.ci_proyectos_filtrados(p_company, p_filtros) t on t.id = a.project_id
   where a.period between v_desde and least(v_hasta, v_hoy)
     and (p_filtros->>'unidad' is null or a.business_unit_id = (p_filtros->>'unidad')::uuid);

  select coalesce(sum(public.ci_convertir(p_company, mp.planned_amount, t.currency, v_moneda, mp.period))
                  filter (where ml.kind = 'ingreso'), 0),
         coalesce(sum(public.ci_convertir(p_company, mp.planned_amount, t.currency, v_moneda, mp.period))
                  filter (where ml.kind <> 'inversion'), 0)
    into v_ing_proy, v_presu
    from public.ci_model_periods mp
    join public.ci_model_lines ml on ml.id = mp.line_id
    join public.ci_proyectos_filtrados(p_company, p_filtros) t on t.modelo = mp.model_id
   where mp.period between v_desde and least(v_hasta, v_hoy)
     and (p_filtros->>'unidad' is null or ml.business_unit_id = (p_filtros->>'unidad')::uuid);

  v_desv := case when v_presu <> 0 then round((v_real - v_presu) / abs(v_presu) * 100, 1) end;

  -- Cada tarjeta viaja con su fórmula y sus insumos, igual que los
  -- indicadores del modelo. Es el mismo objeto que devuelve
  -- `ci_indicador()`, más lo que la tarjeta necesita para pintarse.
  v_cifras := jsonb_build_array(
    public.ci_indicador('capital_solicitado','Capital solicitado', v_solicitado,'dinero',
      'Suma de «capital requerido» de los proyectos del filtro, convertido a ' || v_moneda,
      jsonb_build_array(public.ci_insumo('Proyectos en el filtro', v_proyectos,'numero'))),

    public.ci_indicador('capital_comprometido','Capital comprometido', v_comprometido,'dinero',
      'Suma de «capital captado» de los mismos proyectos',
      jsonb_build_array(public.ci_insumo('Capital solicitado', v_solicitado,'dinero')))
      || jsonb_build_object('nota', case when v_solicitado > 0
           then round(v_comprometido / v_solicitado * 100)::text || '% del objetivo' end),

    public.ci_indicador('capital_pendiente','Capital pendiente',
      greatest(v_solicitado - v_comprometido, 0),'dinero',
      'Capital solicitado − capital comprometido',
      jsonb_build_array(public.ci_insumo('Solicitado', v_solicitado,'dinero'),
                        public.ci_insumo('Comprometido', v_comprometido,'dinero')))
      || jsonb_build_object('tono','aviso'),

    public.ci_indicador('capital_utilizado','Capital utilizado', v_utilizado,'dinero',
      'Suma de lo PAGADO en movimientos reales de naturaleza Inversión',
      jsonb_build_array(public.ci_insumo('Comprometido', v_comprometido,'dinero'))),

    public.ci_indicador('capital_disponible','Capital disponible',
      v_comprometido - v_utilizado,'dinero',
      'Capital comprometido − capital utilizado',
      jsonb_build_array(public.ci_insumo('Comprometido', v_comprometido,'dinero'),
                        public.ci_insumo('Utilizado', v_utilizado,'dinero'))),

    public.ci_indicador('ingresos_proyectados','Ingresos proyectados', v_ing_proy,'dinero',
      'Celdas de ingreso del modelo vigente de cada proyecto, hasta el mes en curso',
      jsonb_build_array(public.ci_insumo('Proyectos sin modelo', v_sin_modelo,'numero')))
      || jsonb_build_object('nota','hasta el mes en curso'),

    public.ci_indicador('ingresos_reales','Ingresos reales', v_ing_real,'dinero',
      'Movimientos reales de naturaleza Ingreso, hasta el mes en curso',
      jsonb_build_array(public.ci_insumo('Proyectado en el mismo tramo', v_ing_proy,'dinero')))
      || jsonb_build_object('nota', case when v_ing_proy > 0
           then round(v_ing_real / v_ing_proy * 100)::text || '% de lo proyectado' end),

    public.ci_indicador('ebitda_real','EBITDA real', v_ebitda,'dinero',
      'Ingresos reales − costos directos reales − gastos operativos reales',
      jsonb_build_array(public.ci_insumo('Ingresos reales', v_ing_real,'dinero'),
                        public.ci_insumo('Costos y gastos reales', v_ing_real - v_ebitda,'dinero'))),

    public.ci_indicador('margen_ebitda','Margen EBITDA',
      case when v_ing_real > 0 then round(v_ebitda / v_ing_real * 100, 1) else 0 end,'porcentaje',
      'EBITDA real ÷ ingresos reales × 100',
      jsonb_build_array(public.ci_insumo('EBITDA real', v_ebitda,'dinero'),
                        public.ci_insumo('Ingresos reales', v_ing_real,'dinero'))),

    public.ci_indicador('desviacion','Desviación presupuestaria', coalesce(v_desv, 0),'porcentaje',
      '(real − presupuesto vigente) ÷ presupuesto vigente × 100, solo sobre meses ya cerrados',
      jsonb_build_array(public.ci_insumo('Real', v_real,'dinero'),
                        public.ci_insumo('Presupuesto vigente', v_presu,'dinero'),
                        public.ci_insumo('Umbral de aviso', v_warn,'porcentaje'),
                        public.ci_insumo('Umbral crítico', v_crit,'porcentaje')))
      || jsonb_build_object('nota','real contra presupuesto vigente',
           'tono', case when abs(coalesce(v_desv,0)) >= v_crit then 'malo'
                        when abs(coalesce(v_desv,0)) >= v_warn then 'aviso' else 'ok' end),

    public.ci_indicador('proyectos_activos','Proyectos activos', v_activos,'numero',
      'Proyectos del filtro que no están en borrador, pausado, cerrado ni rechazado',
      jsonb_build_array(public.ci_insumo('Proyectos en el filtro', v_proyectos,'numero'))),

    public.ci_indicador('proyectos_riesgo','Proyectos en riesgo', v_riesgo,'numero',
      'Proyectos con riesgo declarado Alto o en estado Pausado',
      jsonb_build_array(public.ci_insumo('Proyectos activos', v_activos,'numero')))
      || jsonb_build_object('tono','malo')
  );

  select jsonb_build_array(
    jsonb_build_object('titulo','Ingresos: proyectado contra real',
      'nota','El presupuesto del modelo vigente de cada proyecto, contra lo que se cargó como ejecución.',
      'formato','dinero','leyenda', jsonb_build_array('Proyectado','Real'),
      'puntos', coalesce((select jsonb_agg(jsonb_build_object('x', mes, 'y', proy, 'y2', rea,
                                                              'formato_x','mes') order by mes)
        from (
          select to_char(d,'YYYY-MM') as mes,
            coalesce((select sum(public.ci_convertir(p_company, mp.planned_amount, t.currency, v_moneda, mp.period))
                        from public.ci_model_periods mp
                        join public.ci_model_lines ml on ml.id = mp.line_id
                        join public.ci_proyectos_filtrados(p_company, p_filtros) t on t.modelo = mp.model_id
                       where ml.kind = 'ingreso' and mp.period = d::date), 0) as proy,
            coalesce((select sum(public.ci_convertir(p_company, a.actual_amount, a.currency, v_moneda, a.period))
                        from public.ci_actuals a
                        join public.ci_proyectos_filtrados(p_company, p_filtros) t on t.id = a.project_id
                       where a.kind = 'ingreso' and a.period = d::date), 0) as rea
            from generate_series(date_trunc('month', v_desde), date_trunc('month', v_hasta), interval '1 month') d
        ) s), '[]'::jsonb)))
    into v_series;

  select jsonb_build_array(
    jsonb_build_object('titulo','Proyectos','nota','De aquí salen las cifras de capital de arriba.',
      'columnas', jsonb_build_array(
        jsonb_build_object('k','proyecto','t','Proyecto'),
        jsonb_build_object('k','estado','t','Estado'),
        jsonb_build_object('k','moneda','t','Moneda'),
        jsonb_build_object('k','solicitado','t','Solicitado','formato','dinero'),
        jsonb_build_object('k','captado','t','Captado','formato','dinero'),
        jsonb_build_object('k','avance','t','% captado','formato','porcentaje'),
        jsonb_build_object('k','riesgo','t','Riesgo')),
      'filas', coalesce((select jsonb_agg(jsonb_build_object(
                  'proyecto', name, 'estado', status, 'moneda', currency,
                  'solicitado', public.ci_convertir(p_company, capital_required, currency, v_moneda),
                  'captado',    public.ci_convertir(p_company, capital_committed, currency, v_moneda),
                  'avance', case when capital_required > 0
                                 then round(capital_committed / capital_required * 100, 1) else 0 end,
                  'riesgo', risk_level) order by capital_required desc)
                from public.ci_proyectos_filtrados(p_company, p_filtros)), '[]'::jsonb)),

    jsonb_build_object('titulo','Próximos hitos','nota','Lo que viene en los siguientes 90 días.',
      'columnas', jsonb_build_array(
        jsonb_build_object('k','hito','t','Hito'),
        jsonb_build_object('k','proyecto','t','Proyecto'),
        jsonb_build_object('k','fecha','t','Fecha','formato','fecha'),
        jsonb_build_object('k','monto','t','Capital que libera','formato','dinero')),
      'filas', coalesce((select jsonb_agg(jsonb_build_object(
                  'hito', h.name, 'proyecto', t.name, 'fecha', h.due_date,
                  'monto', public.ci_convertir(p_company, h.amount_conditioned, t.currency, v_moneda))
                  order by h.due_date)
                from public.ci_milestones h
                join public.ci_proyectos_filtrados(p_company, p_filtros) t on t.id = h.project_id
               where h.deleted_at is null and h.status <> 'hecho'
                 and h.due_date between current_date and current_date + 90), '[]'::jsonb)))
    into v_listas;

  if v_sin_tasa > 0 then
    v_alertas := v_alertas || public.ci_aviso('sin_tipo_de_cambio','bloqueante',
      v_sin_tasa || ' proyecto(s) sin tipo de cambio a ' || v_moneda,
      'Sus cifras no entran en el consolidado. Carga la tasa en Tipos de cambio para que sumen.');
  end if;
  if v_sin_modelo > 0 then
    v_alertas := v_alertas || public.ci_aviso('sin_modelo','aviso',
      v_sin_modelo || ' proyecto(s) sin modelo financiero',
      'Aparecen en el capital pero no en las proyecciones: no tienen ni un escenario con líneas.');
  end if;
  if v_desv is not null and abs(v_desv) >= v_crit then
    v_alertas := v_alertas || public.ci_aviso('desviacion_critica','bloqueante',
      'Desviación presupuestaria de ' || v_desv || '%',
      'La ejecución real se separó del presupuesto vigente más allá del umbral crítico de la organización (' || v_crit || '%).');
  end if;
  if v_comprometido > v_solicitado and v_solicitado > 0 then
    v_alertas := v_alertas || public.ci_aviso('capital_excedido','bloqueante',
      'El capital captado supera al solicitado',
      'Revisa los montos comprometidos: alguno está cargado de más.');
  end if;

  return jsonb_build_object(
    'moneda', v_moneda,
    'periodo', jsonb_build_object('desde', to_char(v_desde,'YYYY-MM'), 'hasta', to_char(v_hasta,'YYYY-MM')),
    'umbrales', jsonb_build_object('aviso', v_warn, 'critico', v_crit),
    'cifras', v_cifras, 'series', v_series, 'listas', v_listas, 'alertas', v_alertas);
end $$;
revoke execute on function public.ci_resumen(uuid, jsonb) from public, anon;
grant  execute on function public.ci_resumen(uuid, jsonb) to authenticated;
