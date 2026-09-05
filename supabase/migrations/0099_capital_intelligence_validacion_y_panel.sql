-- ===========================================================
-- 0099 · CAPITAL INTELLIGENCE — validación y presupuesto vs real
-- -----------------------------------------------------------
-- Dos funciones y una regla de convivencia entre ellas.
--
-- `ci_validar_modelo()` busca las inconsistencias que el brief
-- enumera: dos precios para lo mismo, equity que no calza con la
-- valoración, proyección sin costos indirectos, flujo sin saldo
-- inicial, capital captado por encima del objetivo, tipo de cambio
-- ausente. Cada hallazgo trae `nivel`:
--
--   aviso       · se ve, no detiene nada
--   bloqueante  · impide marcar el modelo como validado
--
-- Y ahí está la regla: un aviso NUNCA impide guardar un borrador.
-- Un modelo a medias es un modelo a medias, no un error. Lo que sí
-- se impide es PUBLICARLO como validado, que es cuando alguien de
-- fuera va a creerle. Es la diferencia entre trabajar y firmar.
--
-- `ci_presupuesto_vs_real()` compara cuatro cosas a la vez, porque
-- comparar dos no alcanza: el presupuesto ORIGINAL (la versión 1,
-- lo que se aprobó), el VIGENTE (la versión con la que se trabaja
-- hoy), lo COMPROMETIDO y PAGADO, y lo REAL. La proyección al
-- cierre mezcla lo real de los meses cerrados con lo vigente de los
-- que faltan, que es como se responde "¿en cuánto vamos a terminar?".
--
-- Los umbrales del semáforo salen de `ci_thresholds`, por
-- organización. Un 10% de desviación es grave en una constructora y
-- ruido en un proyecto de marca.
-- ===========================================================

-- El modelo que manda hoy en un proyecto: el validado más reciente y,
-- si no hay ninguno, la última versión del escenario por defecto.
create or replace function public.ci_modelo_vigente(p_project uuid)
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select m.id
    from public.ci_models m
    join public.ci_scenarios s on s.id = m.scenario_id and s.deleted_at is null
   where m.project_id = p_project and m.deleted_at is null and m.state <> 'archivado'
   order by (m.state = 'validado') desc, s.is_default desc, m.version desc
   limit 1;
$$;
revoke execute on function public.ci_modelo_vigente(uuid) from public, anon;
grant  execute on function public.ci_modelo_vigente(uuid) to authenticated;

create or replace function public.ci_aviso(p_clave text, p_nivel text, p_titulo text, p_detalle text)
returns jsonb language sql immutable set search_path = public, pg_temp as $$
  select jsonb_build_object('clave', p_clave, 'nivel', p_nivel,
                            'titulo', p_titulo, 'detalle', p_detalle);
$$;
grant execute on function public.ci_aviso(text,text,text,text) to authenticated;

create or replace function public.ci_validar_modelo(p_model uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  m record; pr record; sc record; a jsonb := '[]'::jsonb;
  v_ing int; v_opex int; v_dep int; v_lineas int;
  v_capex numeric; v_dupla record; v_post numeric; v_equity numeric;
  v_sin_fx int; v_monto_plano int;
begin
  select * into m from public.ci_models where id = p_model and deleted_at is null;
  if m is null then return '[]'::jsonb; end if;
  if not public.ci_ve_proyecto(m.project_id) then return '[]'::jsonb; end if;
  select * into pr from public.ci_projects  where id = m.project_id;
  select * into sc from public.ci_scenarios where id = m.scenario_id;

  select count(*) filter (where kind='ingreso'),
         count(*) filter (where kind='gasto_operativo'),
         count(*) filter (where kind='depreciacion'),
         count(*),
         coalesce(sum(amount) filter (where kind='inversion'), 0),
         count(*) filter (where kind='ingreso' and driver='monto')
    into v_ing, v_opex, v_dep, v_lineas, v_capex, v_monto_plano
    from public.ci_model_lines where model_id = p_model;

  if v_lineas = 0 then
    a := a || public.ci_aviso('sin_lineas','bloqueante','El modelo no tiene ninguna línea',
      'Una proyección vacía no puede validarse. Agrega al menos una fuente de ingreso y sus costos.');
  end if;

  if v_ing = 0 and v_lineas > 0 then
    a := a || public.ci_aviso('sin_ingresos','bloqueante','No hay ninguna línea de ingreso',
      'El modelo solo tiene costos. Sin ingresos no hay margen, ni payback, ni TIR que calcular.');
  elsif v_monto_plano > 0 then
    a := a || public.ci_aviso('ingreso_sin_unidades','aviso',
      v_monto_plano || ' línea(s) de ingreso son un monto suelto',
      'Un ingreso declarado como monto no dice cuántas unidades ni a qué precio. Es la cifra que un inversionista pide desglosar primero.');
  end if;

  if v_ing > 0 and v_opex = 0 then
    a := a || public.ci_aviso('sin_gastos_operativos','bloqueante','La proyección no tiene gastos operativos',
      'Sin personal, arriendo ni administración, el EBITDA que muestra esta proyección es en realidad el margen bruto. Son cosas distintas.');
  end if;
  if v_ing > 0 and v_dep = 0 and v_capex > 0 then
    a := a || public.ci_aviso('capex_sin_depreciacion','aviso','Hay inversión y no hay depreciación',
      'Con CAPEX pero sin depreciación, el EBIT es igual al EBITDA y el resultado del proyecto se ve mejor de lo que es.');
  end if;

  if m.opening_cash is null then
    a := a || public.ci_aviso('sin_saldo_inicial','bloqueante','Falta el saldo inicial de caja',
      'Sin saldo de apertura, el flujo acumulado empieza en cero y la necesidad de capital sale mal. Declara con cuánto parte el proyecto, aunque sea 0.');
  end if;

  if sc.assumptions = '{}'::jsonb then
    a := a || public.ci_aviso('escenario_sin_supuestos','aviso','El escenario no declara sus supuestos',
      'Un escenario sin supuestos escritos no se puede comparar con otro ni defender ante un tercero.');
  end if;
  if m.label is null or btrim(m.label) = '' then
    a := a || public.ci_aviso('version_sin_nombre','aviso','Esta versión no tiene nombre',
      'Las versiones sin etiqueta se vuelven indistinguibles en cuanto hay tres.');
  end if;

  for v_dupla in
    select name, count(distinct unit_price) as precios
      from public.ci_model_lines
     where model_id = p_model and kind = 'ingreso' and unit_price is not null
     group by name having count(distinct unit_price) > 1
  loop
    a := a || public.ci_aviso('precio_inconsistente','bloqueante',
      'Dos precios distintos para «' || v_dupla.name || '»',
      'La misma fuente de ingreso aparece con ' || v_dupla.precios || ' precios diferentes en el mismo modelo. Uno de los dos está mal.');
  end loop;

  for v_dupla in
    select name, category, count(*) as veces
      from public.ci_model_lines
     where model_id = p_model and kind in ('costo_directo','gasto_operativo')
     group by name, category having count(*) > 1
  loop
    a := a || public.ci_aviso('costo_duplicado','aviso',
      '«' || v_dupla.name || '» aparece ' || v_dupla.veces || ' veces',
      'Un costo compartido cargado a varias unidades se suma tantas veces como aparezca. Revisa si es el mismo gasto contado dos veces.');
  end loop;

  v_post := pr.post_money;
  if pr.pre_money is not null and pr.capital_required > 0 then
    if v_post is null then
      a := a || public.ci_aviso('sin_post_money','aviso','Falta la valoración post-money',
        'Con pre-money y capital declarados, la post-money debería ser ' ||
        to_char(pr.pre_money + pr.capital_required, 'FM999999999999.00') || '.');
    elsif abs(v_post - (pr.pre_money + pr.capital_required)) > 0.01 then
      a := a || public.ci_aviso('valoracion_incoherente','bloqueante','La valoración no cuadra',
        'Post-money declarada: ' || to_char(v_post,'FM999999999999.00') ||
        '. Pre-money + inversión: ' || to_char(pr.pre_money + pr.capital_required,'FM999999999999.00') || '.');
    end if;
  end if;
  if pr.pre_money is not null and m.discount_rate_pct is null then
    a := a || public.ci_aviso('valoracion_sin_metodologia','aviso','La valoración no tiene metodología detrás',
      'Hay una pre-money declarada pero el modelo no define tasa de descuento, así que no hay VAN con el que respaldarla.');
  end if;
  if v_post is not null and v_post > 0 and pr.equity_offered_pct is not null then
    v_equity := round(pr.capital_required / v_post * 100, 2);
    if abs(pr.equity_offered_pct - v_equity) > 0.5 then
      a := a || public.ci_aviso('equity_incoherente','bloqueante','El equity ofrecido no calza con la valoración',
        'Ofrecido: ' || pr.equity_offered_pct || '%. Inversión ÷ post-money da ' || v_equity || '%.');
    end if;
  end if;
  if pr.capital_committed > pr.capital_required and pr.capital_required > 0 then
    a := a || public.ci_aviso('capital_excedido','bloqueante','El capital captado supera al objetivo',
      'Captado: ' || to_char(pr.capital_committed,'FM999999999999.00') ||
      ' sobre un objetivo de ' || to_char(pr.capital_required,'FM999999999999.00') || '.');
  end if;

  select count(*) into v_sin_fx from public.ci_actuals
   where project_id = m.project_id and currency <> m.currency and fx_rate is null;
  if v_sin_fx > 0 then
    a := a || public.ci_aviso('sin_tipo_de_cambio','bloqueante',
      v_sin_fx || ' movimiento(s) en otra moneda sin tipo de cambio',
      'Hay ejecución real en una moneda distinta a la del modeloacsin tasa registrada. Esas cifras no se pueden consolidar.');
  end if;

  return a;
end $$;
revoke execute on function public.ci_validar_modelo(uuid) from public, anon;
grant  execute on function public.ci_validar_modelo(uuid) to authenticated;

create or replace function public.ci_marcar_validado(p_model uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare m record; v_avisos jsonb; v_bloq int;
begin
  select * into m from public.ci_models where id = p_model and deleted_at is null;
  if m is null then raise exception 'El modelo no existe'; end if;
  if not public.ci_edita_proyecto(m.project_id) then
    raise exception 'No tienes permiso para editar este proyecto';
  end if;

  v_avisos := public.ci_validar_modelo(p_model);
  select count(*) into v_bloq from jsonb_array_elements(v_avisos) x
   where x->>'nivel' = 'bloqueante';

  if v_bloq > 0 then
    return jsonb_build_object('validado', false, 'bloqueantes', v_bloq, 'avisos', v_avisos);
  end if;

  update public.ci_models
     set state = 'validado', validated_by = (select auth.uid()), validated_at = now()
   where id = p_model;

  return jsonb_build_object('validado', true, 'bloqueantes', 0, 'avisos', v_avisos);
end $$;
revoke execute on function public.ci_marcar_validado(uuid) from public, anon;
grant  execute on function public.ci_marcar_validado(uuid) to authenticated;

create or replace function public.ci_presupuesto_vs_real(
  p_project uuid, p_model uuid default null,
  p_desde date default null, p_hasta date default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  m record; v_original uuid; v_warn numeric; v_crit numeric;
  v_filas jsonb; v_meses jsonb; v_tot jsonb; v_hoy date := date_trunc('month', current_date)::date;
begin
  if not public.ci_ve_proyecto(p_project) then return '{}'::jsonb; end if;
  select * into m from public.ci_models
   where id = coalesce(p_model, public.ci_modelo_vigente(p_project)) and deleted_at is null;
  if m is null then return '{}'::jsonb; end if;

  select id into v_original from public.ci_models
   where scenario_id = m.scenario_id and deleted_at is null
   order by version asc limit 1;

  select warn_pct, critical_pct into v_warn, v_crit
    from public.ci_thresholds
   where company_id = m.company_id and kind = 'general';
  v_warn := coalesce(v_warn, 10); v_crit := coalesce(v_crit, 20);

  p_desde := coalesce(p_desde, m.period_start);
  p_hasta := coalesce(p_hasta, (m.period_start + make_interval(months => m.period_months - 1))::date);

  with meses as (
    select date_trunc('month', d)::date as periodo
      from generate_series(date_trunc('month', p_desde), date_trunc('month', p_hasta), interval '1 month') d
  ),
  cats as (
    select distinct kind, category from (
      select kind, category from public.ci_model_lines where model_id = m.id
      union
      select kind, category from public.ci_actuals
       where project_id = p_project and period between p_desde and p_hasta) u
  ),
  celda as (
    select ms.periodo, c.kind, c.category,
      coalesce((select sum(mp.planned_amount) from public.ci_model_periods mp
                 join public.ci_model_lines ml on ml.id = mp.line_id
                where mp.model_id = v_original and mp.period = ms.periodo
                  and ml.kind = c.kind and ml.category = c.category), 0) as original,
      coalesce((select sum(mp.planned_amount) from public.ci_model_periods mp
                 join public.ci_model_lines ml on ml.id = mp.line_id
                where mp.model_id = m.id and mp.period = ms.periodo
                  and ml.kind = c.kind and ml.category = c.category), 0) as vigente,
      coalesce((select sum(committed_amount) from public.ci_actuals
                where project_id = p_project and period = ms.periodo
                  and kind = c.kind and category = c.category), 0) as comprometido,
      coalesce((select sum(paid_amount) from public.ci_actuals
                where project_id = p_project and period = ms.periodo
                  and kind = c.kind and category = c.category), 0) as pagado,
      coalesce((select sum(actual_amount) from public.ci_actuals
                where project_id = p_project and period = ms.periodo
                  and kind = c.kind and category = c.category), 0) as real
      from meses ms cross join cats c
  ),
  resumen as (
    select kind, category,
      sum(original) as original, sum(vigente) as vigente,
      sum(comprometido) as comprometido, sum(pagado) as pagado, sum(real) as real,
      sum(real) - sum(vigente) as diferencia,
      case when sum(vigente) <> 0 then round(sum(real) / sum(vigente) * 100, 1) end as pct_ejecutado,
      sum(real) filter (where periodo <= v_hoy)
        + sum(vigente) filter (where periodo > v_hoy) as proyeccion_cierre
      from celda group by kind, category
  )
  select jsonb_agg(jsonb_build_object(
           'kind', kind, 'categoria', category,
           'original', original, 'vigente', vigente,
           'comprometido', comprometido, 'pagado', pagado, 'real', real,
           'diferencia', diferencia, 'pct_ejecutado', pct_ejecutado,
           'proyeccion_cierre', proyeccion_cierre,
           'semaforo', case
             when vigente = 0 and real = 0 then 'neutro'
             when vigente = 0 then 'malo'
             when abs(diferencia) / abs(nullif(vigente,0)) * 100 >= v_crit then 'malo'
             when abs(diferencia) / abs(nullif(vigente,0)) * 100 >= v_warn then 'aviso'
             else 'ok' end)
           order by kind, category)
    into v_filas from resumen;

  with meses as (
    select date_trunc('month', d)::date as periodo
      from generate_series(date_trunc('month', p_desde), date_trunc('month', p_hasta), interval '1 month') d
  )
  select jsonb_agg(jsonb_build_object(
           'periodo', to_char(ms.periodo, 'YYYY-MM'),
           'vigente', coalesce((select sum(planned_amount) from public.ci_model_periods
                                 where model_id = m.id and period = ms.periodo), 0),
           'real', coalesce((select sum(actual_amount) from public.ci_actuals
                              where project_id = p_project and period = ms.periodo), 0))
           order by ms.periodo)
    into v_meses from meses ms;

  select jsonb_build_object(
    'original', coalesce(sum((x->>'original')::numeric), 0),
    'vigente',  coalesce(sum((x->>'vigente')::numeric), 0),
    'comprometido', coalesce(sum((x->>'comprometido')::numeric), 0),
    'pagado', coalesce(sum((x->>'pagado')::numeric), 0),
    'real', coalesce(sum((x->>'real')::numeric), 0),
    'diferencia', coalesce(sum((x->>'diferencia')::numeric), 0))
    into v_tot from jsonb_array_elements(coalesce(v_filas,'[]'::jsonb)) x;

  return jsonb_build_object(
    'modelo', jsonb_build_object('id', m.id, 'version', m.version, 'label', m.label,
                                 'estado', m.state, 'moneda', m.currency),
    'original_id', v_original,
    'umbrales', jsonb_build_object('aviso', v_warn, 'critico', v_crit),
    'desde', to_char(p_desde,'YYYY-MM'), 'hasta', to_char(p_hasta,'YYYY-MM'),
    'filas', coalesce(v_filas, '[]'::jsonb),
    'meses', coalesce(v_meses, '[]'::jsonb),
    'totales', v_tot);
end $$;
revoke execute on function public.ci_presupuesto_vs_real(uuid,uuid,date,date) from public, anon;
grant  execute on function public.ci_presupuesto_vs_real(uuid,uuid,date,date) to authenticated;
