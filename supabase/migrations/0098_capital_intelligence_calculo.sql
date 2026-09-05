-- ===========================================================
-- 0098 · CAPITAL INTELLIGENCE — el cálculo
-- -----------------------------------------------------------
-- Todo se calcula aquí, en la base, por la misma razón que
-- `analisis_financiero()` (0094): si el EBITDA se calculara en la
-- pantalla, el mismo mes daría dos cifras según por dónde se mire
-- y no habría forma de saber cuál miente.
--
-- Y una exigencia más del brief, que cambia la forma de la
-- respuesta: NINGUNA CIFRA SIN TRAZABILIDAD. Por eso
-- `ci_modelo_calculado()` no devuelve `{"ebitda": 128400}` sino
--
--   { clave, etiqueta, valor, formula, insumos: [{etiqueta, valor}] }
--
-- La pantalla puede abrir cualquier número y mostrar de qué está
-- hecho, sin recalcular nada y sin poder equivocarse al explicarlo.
--
-- Convenciones, dichas una vez:
--   · un período es SIEMPRE el día 1 del mes
--   · los signos son positivos: ingresos suman, costos restan en
--     la fórmula, no en el dato. Un costo guardado en negativo es
--     un error que se propaga en silencio
--   · growth_pct es crecimiento MENSUAL compuesto
--   · la tasa de descuento se declara ANUAL y se mensualiza con
--     (1+r)^(1/12)-1, no dividiendo por 12
-- ===========================================================

-- ---------- LAS DOS AYUDAS ----------
-- Existen solo para que el bloque de indicadores se pueda leer.
create or replace function public.ci_indicador(p_clave text, p_etiqueta text,
  p_valor numeric, p_formato text, p_formula text, p_insumos jsonb)
returns jsonb language sql immutable set search_path = public, pg_temp as $$
  select jsonb_build_object('clave', p_clave, 'etiqueta', p_etiqueta,
                            'valor', p_valor, 'formato', p_formato,
                            'formula', p_formula, 'insumos', coalesce(p_insumos, '[]'::jsonb));
$$;

create or replace function public.ci_insumo(p_etiqueta text, p_valor numeric, p_formato text)
returns jsonb language sql immutable set search_path = public, pg_temp as $$
  select jsonb_build_object('etiqueta', p_etiqueta, 'valor', p_valor, 'formato', p_formato);
$$;


-- ---------- VAN ----------
create or replace function public.ci_van(p_flujos numeric[], p_tasa_mensual numeric)
returns numeric language sql immutable set search_path = public, pg_temp as $$
  select round(coalesce(sum(f / power(1 + p_tasa_mensual, i - 1)), 0), 2)
    from unnest(p_flujos) with ordinality as t(f, i);
$$;
comment on function public.ci_van(numeric[], numeric) is
  'VAN con el primer flujo en el momento 0. Tasa MENSUAL.';

-- ---------- TIR ----------
-- Por bisección. Newton converge más rápido y falla más: con flujos
-- de proyecto reales —dos o tres cambios de signo— se va a un valor
-- absurdo sin avisar. Aquí, si no hay raíz en el intervalo, se
-- devuelve null y la pantalla dice "no se puede calcular", que es
-- la respuesta honesta.
create or replace function public.ci_tir(p_flujos numeric[])
returns numeric language plpgsql immutable set search_path = public, pg_temp as $$
declare lo numeric := -0.999999; hi numeric := 1.0; mid numeric;
        v numeric; v_lo numeric; n int; i int; j int;
begin
  n := coalesce(array_length(p_flujos, 1), 0);
  if n < 2 then return null; end if;
  if not (exists (select 1 from unnest(p_flujos) f where f > 0)
      and exists (select 1 from unnest(p_flujos) f where f < 0)) then
    return null;                      -- sin cambio de signo no hay TIR
  end if;

  v_lo := public.ci_van(p_flujos, lo);
  if v_lo * public.ci_van(p_flujos, hi) > 0 then return null; end if;

  for i in 1..120 loop
    mid := (lo + hi) / 2;
    v := public.ci_van(p_flujos, mid);
    exit when abs(v) < 0.01;
    if (v > 0) = (v_lo > 0) then lo := mid; v_lo := v; else hi := mid; end if;
  end loop;
  return round(mid, 8);
end $$;
comment on function public.ci_tir(numeric[]) is
  'TIR MENSUAL por bisección. Devuelve null cuando no hay raíz: mejor eso que un número inventado.';

-- ---------- GENERAR LA MATRIZ ----------
-- Expande cada línea a sus meses. Respeta lo que una persona
-- escribió a mano (`source = 'manual'`): la fórmula no pisa una
-- corrección, porque el mes que alguien ajustó suele ser el único
-- que de verdad se sabe.
create or replace function public.ci_generar_periodos(p_model uuid)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare
  m record; l record; i int; k int; v_periodo date;
  v_cant numeric; v_monto numeric; v_creados int := 0;
  v_ingresos numeric;
begin
  select * into m from public.ci_models where id = p_model and deleted_at is null;
  if m is null then raise exception 'El modelo no existe'; end if;
  if not public.ci_edita_proyecto(m.project_id) then
    raise exception 'No tienes permiso para editar este proyecto';
  end if;
  if m.state = 'validado' then
    raise exception 'Este modelo está validado. Crea una versión nueva para cambiarlo.';
  end if;

  -- Primera pasada: todo lo que no depende de los ingresos.
  for l in select * from public.ci_model_lines
            where model_id = p_model and driver <> 'pct_ingresos' order by sort, name loop
    for i in 0 .. m.period_months - 1 loop
      continue when i < l.start_offset;
      k := i - l.start_offset;
      continue when l.frequency = 'unica' and k <> 0;
      continue when l.frequency = 'anual' and (k % 12) <> 0;

      v_periodo := (m.period_start + make_interval(months => i))::date;
      v_periodo := date_trunc('month', v_periodo)::date;

      if l.driver = 'cantidad_precio' then
        v_cant  := coalesce(l.quantity, 0) * power(1 + coalesce(l.growth_pct, 0) / 100.0, k);
        v_monto := v_cant * coalesce(l.unit_price, 0);
      else
        v_cant  := null;
        v_monto := coalesce(l.amount, 0) * power(1 + coalesce(l.growth_pct, 0) / 100.0, k);
      end if;

      insert into public.ci_model_periods
        (company_id, project_id, model_id, line_id, period, planned_amount,
         quantity, unit_price, source)
      values (m.company_id, m.project_id, p_model, l.id, v_periodo, round(v_monto, 2),
              v_cant, l.unit_price, 'formula')
      on conflict (line_id, period) do update
        set planned_amount = excluded.planned_amount,
            quantity       = excluded.quantity,
            unit_price     = excluded.unit_price
        where ci_model_periods.source = 'formula';
      v_creados := v_creados + 1;
    end loop;
  end loop;

  -- Segunda pasada: las líneas que son un % de los ingresos del mes.
  -- Van después a propósito: necesitan los ingresos ya escritos.
  for l in select * from public.ci_model_lines
            where model_id = p_model and driver = 'pct_ingresos' order by sort, name loop
    for i in 0 .. m.period_months - 1 loop
      continue when i < l.start_offset;
      v_periodo := date_trunc('month', (m.period_start + make_interval(months => i))::date)::date;

      select coalesce(sum(mp.planned_amount), 0) into v_ingresos
        from public.ci_model_periods mp
        join public.ci_model_lines ml on ml.id = mp.line_id
       where mp.model_id = p_model and mp.period = v_periodo and ml.kind = 'ingreso';

      v_monto := v_ingresos * coalesce(l.pct, 0) / 100.0;

      insert into public.ci_model_periods
        (company_id, project_id, model_id, line_id, period, planned_amount, source)
      values (m.company_id, m.project_id, p_model, l.id, v_periodo, round(v_monto, 2), 'formula')
      on conflict (line_id, period) do update
        set planned_amount = excluded.planned_amount
        where ci_model_periods.source = 'formula';
      v_creados := v_creados + 1;
    end loop;
  end loop;

  -- Fuera de rango: si alguien acorta el horizonte, las celdas que
  -- sobran no se quedan sumando en silencio.
  delete from public.ci_model_periods
   where model_id = p_model
     and period >= date_trunc('month', (m.period_start + make_interval(months => m.period_months))::date);

  return v_creados;
end $$;
revoke execute on function public.ci_generar_periodos(uuid) from public, anon;
grant  execute on function public.ci_generar_periodos(uuid) to authenticated;

-- ---------- EL MODELO, CALCULADO ----------
create or replace function public.ci_modelo_calculado(p_model uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  m record; pr record; sc record;
  v_meses jsonb; v_lineas jsonb; v_ind jsonb;
  v_tasa_anual numeric; v_tasa_mes numeric; v_imp numeric;
  v_fcl numeric[];
  v_ing numeric; v_cogs numeric; v_opex numeric; v_dep numeric; v_capex numeric;
  v_ebitda numeric; v_ebit numeric; v_min_caja numeric;
  v_van numeric; v_tir numeric; v_roi numeric;
  v_payback int; v_equilibrio int; v_runway int;
  v_burn numeric; v_meses_burn int;
  v_total_inv numeric;
begin
  select * into m from public.ci_models where id = p_model and deleted_at is null;
  if m is null then return '{}'::jsonb; end if;
  if not public.ci_ve_proyecto(m.project_id) then return '{}'::jsonb; end if;

  select * into pr from public.ci_projects  where id = m.project_id;
  select * into sc from public.ci_scenarios where id = m.scenario_id;

  v_tasa_anual := coalesce(m.discount_rate_pct, 0) / 100.0;
  v_tasa_mes   := case when v_tasa_anual = 0 then 0
                       else power(1 + v_tasa_anual, 1.0/12.0) - 1 end;
  v_imp        := coalesce(m.tax_rate_pct, 0) / 100.0;

  -- ---- la serie mensual, con la caja arrastrada ----
  with base as (
    select date_trunc('month', (m.period_start + make_interval(months => g)))::date as periodo
      from generate_series(0, m.period_months - 1) g
  ),
  agg as (
    select b.periodo,
      coalesce(sum(mp.planned_amount) filter (where ml.kind = 'ingreso'), 0)         as ingresos,
      coalesce(sum(mp.planned_amount) filter (where ml.kind = 'costo_directo'), 0)   as cogs,
      coalesce(sum(mp.planned_amount) filter (where ml.kind = 'gasto_operativo'), 0) as opex,
      coalesce(sum(mp.planned_amount) filter (where ml.kind = 'depreciacion'), 0)    as depreciacion,
      coalesce(sum(mp.planned_amount) filter (where ml.kind = 'inversion'), 0)       as capex
      from base b
      left join public.ci_model_periods mp on mp.period = b.periodo and mp.model_id = p_model
      left join public.ci_model_lines   ml on ml.id = mp.line_id
     group by b.periodo
  ),
  calc as (
    select a.*,
      a.ingresos - a.cogs                                as margen_bruto,
      a.ingresos - a.cogs - a.opex                       as ebitda,
      a.ingresos - a.cogs - a.opex - a.depreciacion      as ebit,
      greatest(a.ingresos - a.cogs - a.opex - a.depreciacion, 0) * v_imp as impuesto
      from agg a
  ),
  flujo as (
    select c.*,
      c.ebitda - c.impuesto                        as fco,
      c.ebitda - c.impuesto - c.capex              as fcl,
      coalesce(m.opening_cash, 0)
        + sum(c.ebitda - c.impuesto - c.capex) over (order by c.periodo
              rows between unbounded preceding and current row) as caja_acumulada,
      row_number() over (order by c.periodo) as n
      from calc c
  )
  select jsonb_agg(jsonb_build_object(
           'periodo', to_char(periodo, 'YYYY-MM'),
           'ingresos', ingresos, 'cogs', cogs, 'margen_bruto', margen_bruto,
           'margen_pct', case when ingresos > 0 then round(margen_bruto / ingresos * 100, 1) end,
           'opex', opex, 'ebitda', ebitda,
           'ebitda_pct', case when ingresos > 0 then round(ebitda / ingresos * 100, 1) end,
           'depreciacion', depreciacion, 'ebit', ebit, 'impuesto', round(impuesto, 2),
           'capex', capex, 'fco', round(fco, 2), 'fcl', round(fcl, 2),
           'caja_acumulada', round(caja_acumulada, 2)) order by periodo),
         array_agg(round(fcl, 2) order by periodo),
         sum(ingresos), sum(cogs), sum(opex), sum(depreciacion), sum(capex),
         sum(ebitda), sum(ebit), min(caja_acumulada),
         min(n) filter (where ebitda >= 0 and ingresos > 0),
         min(n) filter (where caja_acumulada < 0),
         -sum(fcl) filter (where fcl < 0), count(*) filter (where fcl < 0)
    into v_meses, v_fcl, v_ing, v_cogs, v_opex, v_dep, v_capex,
         v_ebitda, v_ebit, v_min_caja, v_equilibrio, v_runway, v_burn, v_meses_burn
    from flujo;

  if v_meses is null then return '{}'::jsonb; end if;

  -- ---- las líneas, con su fila de meses ----
  select jsonb_agg(x order by x->>'kind', (x->>'sort')::int, x->>'name') into v_lineas from (
    select jsonb_build_object(
      'id', l.id, 'kind', l.kind, 'category', l.category, 'name', l.name,
      'unidad', bu.name, 'unidad_id', l.business_unit_id,
      'driver', l.driver, 'quantity', l.quantity, 'unit_price', l.unit_price,
      'amount', l.amount, 'pct', l.pct, 'growth_pct', l.growth_pct,
      'frequency', l.frequency, 'sort', l.sort,
      'total', coalesce((select sum(planned_amount) from public.ci_model_periods
                          where line_id = l.id), 0),
      'meses', coalesce((select jsonb_object_agg(to_char(period,'YYYY-MM'),
                                jsonb_build_object('monto', planned_amount,
                                                   'cantidad', quantity,
                                                   'precio', unit_price,
                                                   'origen', source))
                           from public.ci_model_periods where line_id = l.id), '{}'::jsonb)) x
      from public.ci_model_lines l
      left join public.ci_business_units bu on bu.id = l.business_unit_id
     where l.model_id = p_model) t;

  -- ---- payback: el primer mes en que lo acumulado deja de ser negativo ----
  select min(i) into v_payback from (
    select i, sum(v_fcl[j]) as acum
      from generate_series(1, coalesce(array_length(v_fcl,1),0)) i,
           lateral generate_series(1, i) j
     group by i) t
   where acum >= 0;

  v_total_inv := v_capex + greatest(coalesce(-v_min_caja, 0), 0);
  v_van := public.ci_van(v_fcl, v_tasa_mes);
  v_tir := public.ci_tir(v_fcl);
  v_roi := case when v_total_inv > 0
                then round((coalesce(v_ebitda,0) - coalesce(v_capex,0)) / v_total_inv * 100, 1) end;

  -- ---- los indicadores, cada uno con su fórmula y sus insumos ----
  -- Esta es la parte que el brief pide y que casi ningún sistema
  -- entrega: el número viene con su explicación pegada, en el mismo
  -- objeto, para que la pantalla no tenga que reconstruirla.
  v_ind := jsonb_build_array(
    public.ci_indicador('ingresos', 'Ingresos proyectados', v_ing, 'dinero',
      'Suma de todas las líneas de tipo Ingreso en el horizonte',
      jsonb_build_array(public.ci_insumo('Meses del horizonte', m.period_months, 'numero'),
                        public.ci_insumo('Líneas de ingreso',
                          (select count(*) from public.ci_model_lines where model_id=p_model and kind='ingreso'), 'numero'))),

    public.ci_indicador('cogs', 'Costo de ventas', v_cogs, 'dinero',
      'Suma de las líneas de tipo Costo directo',
      jsonb_build_array(public.ci_insumo('Líneas de costo directo',
                          (select count(*) from public.ci_model_lines where model_id=p_model and kind='costo_directo'), 'numero'))),

    public.ci_indicador('margen_bruto', 'Margen bruto', v_ing - v_cogs, 'dinero',
      'Ingresos − Costo de ventas',
      jsonb_build_array(public.ci_insumo('Ingresos', v_ing, 'dinero'),
                        public.ci_insumo('Costo de ventas', v_cogs, 'dinero'))),

    public.ci_indicador('margen_pct', 'Margen bruto %',
      case when v_ing > 0 then round((v_ing - v_cogs) / v_ing * 100, 1) end, 'porcentaje',
      'Margen bruto ÷ Ingresos × 100',
      jsonb_build_array(public.ci_insumo('Margen bruto', v_ing - v_cogs, 'dinero'),
                        public.ci_insumo('Ingresos', v_ing, 'dinero'))),

    public.ci_indicador('ebitda', 'EBITDA', v_ebitda, 'dinero',
      'Ingresos − Costo de ventas − Gastos operativos',
      jsonb_build_array(public.ci_insumo('Ingresos', v_ing, 'dinero'),
                        public.ci_insumo('Costo de ventas', v_cogs, 'dinero'),
                        public.ci_insumo('Gastos operativos', v_opex, 'dinero'))),

    public.ci_indicador('ebitda_pct', 'Margen EBITDA',
      case when v_ing > 0 then round(v_ebitda / v_ing * 100, 1) end, 'porcentaje',
      'EBITDA ÷ Ingresos × 100',
      jsonb_build_array(public.ci_insumo('EBITDA', v_ebitda, 'dinero'),
                        public.ci_insumo('Ingresos', v_ing, 'dinero'))),

    public.ci_indicador('ebit', 'EBIT', v_ebit, 'dinero',
      'EBITDA − Depreciación',
      jsonb_build_array(public.ci_insumo('EBITDA', v_ebitda, 'dinero'),
                        public.ci_insumo('Depreciación', v_dep, 'dinero'))),

    public.ci_indicador('capex', 'Inversión (CAPEX)', v_capex, 'dinero',
      'Suma de las líneas de tipo Inversión',
      jsonb_build_array(public.ci_insumo('Líneas de inversión',
                          (select count(*) from public.ci_model_lines where model_id=p_model and kind='inversion'), 'numero'))),

    public.ci_indicador('necesidad_capital', 'Necesidad acumulada de capital',
      greatest(coalesce(-v_min_caja, 0), 0), 'dinero',
      'El punto más bajo de la caja acumulada, en negativo. Es lo que hay que poner para no quebrar por el camino',
      jsonb_build_array(public.ci_insumo('Saldo inicial declarado', m.opening_cash, 'dinero'),
                        public.ci_insumo('Caja acumulada mínima', v_min_caja, 'dinero'))),

    public.ci_indicador('burn_rate', 'Burn rate mensual',
      case when v_meses_burn > 0 then round(v_burn / v_meses_burn, 2) end, 'dinero',
      'Promedio de la salida neta de caja en los meses en que el flujo libre es negativo',
      jsonb_build_array(public.ci_insumo('Caja consumida', v_burn, 'dinero'),
                        public.ci_insumo('Meses con flujo negativo', v_meses_burn, 'numero'))),

    public.ci_indicador('runway', 'Runway',
      case when v_runway is null then null else v_runway - 1 end, 'meses',
      'Meses hasta que la caja acumulada se vuelve negativa. Si nunca ocurre, el proyecto se sostiene solo',
      jsonb_build_array(public.ci_insumo('Saldo inicial declarado', m.opening_cash, 'dinero'),
                        public.ci_insumo('Primer mes en rojo', v_runway, 'numero'))),

    public.ci_indicador('punto_equilibrio', 'Punto de equilibrio', v_equilibrio, 'meses',
      'Primer mes con EBITDA no negativo e ingresos mayores que cero',
      jsonb_build_array(public.ci_insumo('Mes', v_equilibrio, 'numero'))),

    public.ci_indicador('payback', 'Payback', v_payback, 'meses',
      'Primer mes en que el flujo de caja libre acumulado deja de ser negativo',
      jsonb_build_array(public.ci_insumo('Inversión total', v_total_inv, 'dinero'))),

    public.ci_indicador('roi', 'ROI proyectado', v_roi, 'porcentaje',
      '(EBITDA acumulado − CAPEX) ÷ Inversión total × 100',
      jsonb_build_array(public.ci_insumo('EBITDA acumulado', v_ebitda, 'dinero'),
                        public.ci_insumo('CAPEX', v_capex, 'dinero'),
                        public.ci_insumo('Inversión total', v_total_inv, 'dinero'))),

    public.ci_indicador('van', 'VAN / NPV',
      case when m.discount_rate_pct is null then null else v_van end, 'dinero',
      'Σ flujo libre del mes ÷ (1 + tasa mensual)^mes. La tasa anual se mensualiza con (1+r)^(1/12)−1',
      jsonb_build_array(public.ci_insumo('Tasa de descuento anual', m.discount_rate_pct, 'porcentaje'),
                        public.ci_insumo('Tasa mensual equivalente', round(v_tasa_mes * 100, 4), 'porcentaje'),
                        public.ci_insumo('Meses', m.period_months, 'numero'))),

    public.ci_indicador('tir', 'TIR / IRR',
      case when v_tir is null then null else round((power(1 + v_tir, 12) - 1) * 100, 2) end, 'porcentaje',
      'Tasa que hace VAN = 0, calculada mensual por bisección y anualizada con (1+i)^12−1',
      jsonb_build_array(public.ci_insumo('TIR mensual',
                          case when v_tir is null then null else round(v_tir * 100, 4) end, 'porcentaje'),
                        public.ci_insumo('Flujos considerados', coalesce(array_length(v_fcl,1),0), 'numero')))
  );

  return jsonb_build_object(
    'modelo', jsonb_build_object(
       'id', m.id, 'version', m.version, 'label', m.label, 'estado', m.state,
       'moneda', m.currency, 'inicio', to_char(m.period_start,'YYYY-MM'),
       'meses', m.period_months, 'saldo_inicial', m.opening_cash,
       'tasa_descuento', m.discount_rate_pct, 'tasa_impuesto', m.tax_rate_pct,
       'validado_en', m.validated_at, 'creado_en', m.created_at),
    'proyecto',  jsonb_build_object('id', pr.id, 'nombre', pr.name, 'codigo', pr.code,
                                    'moneda', pr.currency, 'estado', pr.status),
    'escenario', jsonb_build_object('id', sc.id, 'nombre', sc.name, 'tipo', sc.kind,
                                    'supuestos', sc.assumptions),
    'meses', v_meses,
    'lineas', coalesce(v_lineas, '[]'::jsonb),
    'indicadores', v_ind);
end $$;

revoke execute on function public.ci_modelo_calculado(uuid) from public, anon;
grant  execute on function public.ci_modelo_calculado(uuid) to authenticated;
grant  execute on function public.ci_van(numeric[], numeric) to authenticated;
grant  execute on function public.ci_tir(numeric[]) to authenticated;
grant  execute on function public.ci_indicador(text,text,numeric,text,text,jsonb) to authenticated;
grant  execute on function public.ci_insumo(text,numeric,text) to authenticated;

-- ---------- UNA VERSIÓN NUEVA ----------
-- Clona el modelo entero con sus líneas y sus celdas. Es la única
-- forma de seguir trabajando sobre algo ya validado, y por eso la
-- versión anterior sobrevive intacta.
create or replace function public.ci_nueva_version(p_model uuid, p_label text default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare m record; l record; v_nuevo uuid; v_linea uuid; v_version int;
begin
  select * into m from public.ci_models where id = p_model and deleted_at is null;
  if m is null then raise exception 'El modelo no existe'; end if;
  if not public.ci_edita_proyecto(m.project_id) then
    raise exception 'No tienes permiso para editar este proyecto';
  end if;

  select coalesce(max(version), 0) + 1 into v_version
    from public.ci_models where scenario_id = m.scenario_id;

  insert into public.ci_models
    (company_id, project_id, scenario_id, version, label, currency, period_start,
     period_months, opening_cash, discount_rate_pct, tax_rate_pct, state, notes, created_by)
  values (m.company_id, m.project_id, m.scenario_id, v_version,
          coalesce(p_label, 'Versión ' || v_version), m.currency, m.period_start,
          m.period_months, m.opening_cash, m.discount_rate_pct, m.tax_rate_pct,
          'borrador', m.notes, (select auth.uid()))
  returning id into v_nuevo;

  /* Línea por línea, para no tener que adivinar después cuál es cuál:
     emparejarlas por nombre habría duplicado celdas en cuanto dos
     líneas se llamaran igual, que es lo normal entre unidades. */
  for l in select * from public.ci_model_lines where model_id = p_model order by sort, name loop
    insert into public.ci_model_lines
      (company_id, project_id, model_id, business_unit_id, kind, category, name,
       driver, quantity, unit_price, amount, pct, growth_pct, frequency,
       start_offset, notes, sort, custom)
    values (l.company_id, l.project_id, v_nuevo, l.business_unit_id, l.kind, l.category, l.name,
            l.driver, l.quantity, l.unit_price, l.amount, l.pct, l.growth_pct, l.frequency,
            l.start_offset, l.notes, l.sort, l.custom)
    returning id into v_linea;

    /* Las celdas viajan con su marca: una corrección hecha a mano no
       debería perderse al versionar. */
    insert into public.ci_model_periods
      (company_id, project_id, model_id, line_id, period, planned_amount,
       quantity, unit_price, source, note)
    select mp.company_id, mp.project_id, v_nuevo, v_linea, mp.period, mp.planned_amount,
           mp.quantity, mp.unit_price, mp.source, mp.note
      from public.ci_model_periods mp where mp.line_id = l.id;
  end loop;

  return v_nuevo;
end $$;
revoke execute on function public.ci_nueva_version(uuid, text) from public, anon;
grant  execute on function public.ci_nueva_version(uuid, text) to authenticated;
