-- ===========================================================
-- 0122 · REAL ESTATE INTELLIGENCE — el cálculo
-- -----------------------------------------------------------
-- Todo lo que se suma, se pondera o se descuenta vive AQUÍ, en
-- PostgreSQL, por la misma razón que en Capital Intelligence: el
-- margen de un proyecto tiene que dar lo mismo en la pantalla de
-- prefactibilidad, en el panel y en el informe que se imprime para
-- el comité. La única forma de garantizarlo es que exista un solo
-- lugar donde se calcule.
--
-- Y todo lo que se calcula sale con su FÓRMULA y sus INSUMOS pegados,
-- en el mismo objeto `{clave, etiqueta, valor, formato, formula,
-- insumos[]}` que ya devuelve CI. Una cifra sin origen se discute a
-- ciegas: quien la mira solo puede creerla o no. Con la fórmula a la
-- vista, la conversación pasa a ser sobre el supuesto, que es donde
-- debería estar.
--
-- Se reutilizan de 0098 `ci_indicador()`, `ci_insumo()`, `ci_van()` y
-- `ci_tir()`. Son aritmética sobre `numeric[]`: no saben de proyectos
-- de inversión ni de predios, y volver a escribirlas con otro prefijo
-- habría creado dos TIR que pueden empezar a diferir.
-- ===========================================================

-- ---------- SUPUESTOS ----------
-- Lee un supuesto de la organización. Devuelve `p_defecto` cuando no
-- está cargado, y ese defecto es siempre explícito en quien llama:
-- una constante escondida en esta función sería exactamente lo que
-- `rei_parameters` existe para evitar.
create or replace function public.rei_parametro(
  p_company uuid, p_slug text, p_defecto numeric default null)
returns numeric language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select value from public.rei_parameters
      where company_id = p_company and slug = p_slug and deleted_at is null),
    p_defecto);
$$;
comment on function public.rei_parametro(uuid, text, numeric) is
  'Supuesto de la organización. Los pct vienen en puntos porcentuales: quien calcula divide por 100.';
revoke execute on function public.rei_parametro(uuid, text, numeric) from public, anon;
grant  execute on function public.rei_parametro(uuid, text, numeric) to authenticated;

-- ---------- DÍAS EN MERCADO ----------
-- Un inmueble vendido midió hasta que se vendió; uno disponible sigue
-- midiendo hoy. Y un vendido SIN fecha de venta devuelve null, no un
-- número: es el hueco de dato más común de un CRM inmobiliario, y
-- taparlo con la fecha de hoy inventaría meses de permanencia que
-- nadie vivió. El panel lo cuenta y lo avisa.
create or replace function public.rei_dias_en_mercado(
  p_ingreso date, p_venta date, p_estado text)
returns int language sql stable set search_path = public, pg_temp as $$
  select case
    when p_ingreso is null            then null
    when lower(coalesce(p_estado,'')) = 'vendido'
      then case when p_venta is null then null else (p_venta - p_ingreso) end
    else (current_date - p_ingreso)
  end;
$$;
revoke execute on function public.rei_dias_en_mercado(date, date, text) from public, anon;
grant  execute on function public.rei_dias_en_mercado(date, date, text) to authenticated;

-- ---------- BANDA Y DECISIÓN ----------
-- El corte de las bandas es producto, no configuración: cambiarlo por
-- organización haría que un «A» de una firma no significara lo mismo
-- que el de otra, y la banda existe justamente para hablar rápido.
-- Lo que sí es configurable son los criterios y sus pesos, que es
-- donde vive el juicio de cada firma.
create or replace function public.rei_banda(p_score numeric)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_score is null then null
    when p_score >= 4 then 'A'
    when p_score >= 3 then 'B'
    when p_score >= 2 then 'C'
    else 'D'
  end;
$$;

create or replace function public.rei_decision(p_banda text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case p_banda
    when 'A' then 'Estructurar ahora'
    when 'B' then 'Al pipeline: profundizar prefactibilidad'
    when 'C' then 'Reevaluar o renegociar condiciones'
    when 'D' then 'No continuar'
  end;
$$;
-- El `revoke` antes del `grant` no es ceremonia: PostgreSQL concede
-- EXECUTE a PUBLIC por defecto, así que sin él estas dos quedan
-- abiertas a `anon` aunque el grant nombre solo a `authenticated`.
revoke execute on function public.rei_banda(numeric) from public, anon;
revoke execute on function public.rei_decision(text) from public, anon;
grant  execute on function public.rei_banda(numeric)  to authenticated;
grant  execute on function public.rei_decision(text)  to authenticated;

-- ---------- CALIFICACIÓN DE UNA OPORTUNIDAD ----------
-- Promedio ponderado sobre los criterios ACTIVOS que fueron
-- calificados. Dividir por el peso de lo calificado y no por 100 es
-- la decisión importante: una oportunidad con cinco de siete
-- criterios puestos da su nota sobre esos cinco, en vez de castigarla
-- con ceros por los dos que nadie ha mirado todavía. `cubierto` dice
-- cuánto peso respalda esa nota, para que una nota de 4,8 con el 30%
-- del peso no se lea igual que una con el 100%.
create or replace function public.rei_score(p_opportunity uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_company uuid; v_score numeric; v_peso numeric; v_total numeric;
  v_n int; v_activos int; v_banda text;
begin
  select company_id into v_company from public.rei_opportunities
   where id = p_opportunity and deleted_at is null;
  if v_company is null then return '{}'::jsonb; end if;
  if not public.has_company_level(v_company, 40) then return '{}'::jsonb; end if;

  select count(*), coalesce(sum(weight_pct), 0)
    into v_activos, v_total
    from public.rei_criteria
   where company_id = v_company and active and deleted_at is null;

  select coalesce(sum(s.score * c.weight_pct), 0), coalesce(sum(c.weight_pct), 0), count(*)
    into v_score, v_peso, v_n
    from public.rei_opportunity_scores s
    join public.rei_criteria c on c.id = s.criterion_id
   where s.opportunity_id = p_opportunity and c.active and c.deleted_at is null;

  v_score := case when v_peso > 0 then round(v_score / v_peso, 2) end;
  v_banda := public.rei_banda(v_score);

  return jsonb_build_object(
    'score',     v_score,
    'banda',     v_banda,
    'decision',  public.rei_decision(v_banda),
    'criterios_activos',   v_activos,
    'criterios_calificados', v_n,
    'peso_declarado', v_total,
    'peso_cubierto',  v_peso,
    'cubierto_pct', case when v_total > 0 then round(v_peso / v_total * 100, 1) end);
end $$;
comment on function public.rei_score(uuid) is
  'Promedio ponderado 1-5 de una oportunidad sobre los criterios calificados. `cubierto_pct` dice cuánto peso respalda la nota.';
revoke execute on function public.rei_score(uuid) from public, anon;
grant  execute on function public.rei_score(uuid) to authenticated;

-- ---------- LA MATRIZ COMPLETA ----------
-- Los criterios con su peso, y cada oportunidad con su calificación
-- por criterio y su nota. Es UNA llamada porque la pantalla es una
-- matriz: pedir la nota oportunidad por oportunidad habría sido una
-- consulta por celda para dibujar una sola tabla.
create or replace function public.rei_matriz_scoring(p_company uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_criterios jsonb; v_filas jsonb; v_total numeric; v_avisos jsonb := '[]'::jsonb;
begin
  if not public.has_company_level(p_company, 40) then return '{}'::jsonb; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'nombre', name, 'peso', weight_pct, 'mide', measures,
           'bajo', level_low, 'medio', level_mid, 'alto', level_high, 'orden', sort)
         order by sort, name), '[]'::jsonb),
         coalesce(sum(weight_pct), 0)
    into v_criterios, v_total
    from public.rei_criteria
   where company_id = p_company and active and deleted_at is null;

  select coalesce(jsonb_agg(f order by f->>'nombre'), '[]'::jsonb) into v_filas
    from (
      select jsonb_build_object(
        'id', o.id, 'codigo', o.code, 'nombre', o.name,
        'municipio', o.municipality, 'area_m2', o.area_m2,
        'precio', o.asking_price, 'precio_m2', o.price_m2, 'estado', o.status,
        'calificaciones', coalesce((
          select jsonb_object_agg(s.criterion_id::text, jsonb_build_object('valor', s.score, 'nota', s.note))
            from public.rei_opportunity_scores s
            join public.rei_criteria c on c.id = s.criterion_id
           where s.opportunity_id = o.id and c.active and c.deleted_at is null), '{}'::jsonb)
        ) || public.rei_score(o.id) as f
        from public.rei_opportunities o
       where o.company_id = p_company and o.deleted_at is null
         and o.status <> 'descartada'
    ) t;

  -- Los pesos que no suman 100 no son un error que deba impedir
  -- guardar —mientras se reparten, nunca suman— pero sí uno que hay
  -- que ver antes de firmar una decisión con esa nota.
  if v_total <> 100 and jsonb_array_length(v_criterios) > 0 then
    v_avisos := v_avisos || public.ci_aviso('pesos_no_suman', 'aviso',
      'Los pesos suman ' || trim(to_char(v_total, 'FM999990.##')) || '%, no 100%',
      'Las notas siguen saliendo —se dividen por el peso realmente repartido— pero comparar dos oportunidades calificadas con repartos distintos no significa nada.');
  end if;
  if jsonb_array_length(v_criterios) = 0 then
    v_avisos := v_avisos || public.ci_aviso('sin_criterios', 'bloqueante',
      'No hay criterios de calificación',
      'Sin criterios no hay nota, y sin nota el pipeline se ordena por intuición. Cárgalos en la pestaña Criterios.');
  end if;

  return jsonb_build_object('criterios', v_criterios, 'peso_total', v_total,
                            'oportunidades', v_filas, 'alertas', v_avisos);
end $$;
revoke execute on function public.rei_matriz_scoring(uuid) from public, anon;
grant  execute on function public.rei_matriz_scoring(uuid) to authenticated;

-- ---------- AVANCE EN EL PIPELINE ----------
-- El % de avance es la posición de la etapa sobre el total de etapas
-- activas. Por eso las etapas son una tabla: una firma que no monta
-- fiducia tiene once etapas y su última sigue siendo el 100%.
create or replace function public.rei_avance_etapa(p_development uuid)
returns numeric language sql stable security definer set search_path = public, pg_temp as $$
  with e as (
    select s.id, row_number() over (order by s.sort, s.name) as pos,
           count(*) over () as total
      from public.rei_stages s
      join public.rei_developments d on d.company_id = s.company_id
     where d.id = p_development and s.active and s.deleted_at is null
  )
  select round(e.pos::numeric / e.total * 100, 1)
    from public.rei_developments d
    join e on e.id = d.stage_id
   where d.id = p_development and d.deleted_at is null
     and public.has_company_level(d.company_id, 40);
$$;
comment on function public.rei_avance_etapa(uuid) is
  'Posición de la etapa actual sobre el total de etapas activas. Null si el desarrollo no tiene etapa puesta.';
revoke execute on function public.rei_avance_etapa(uuid) from public, anon;
grant  execute on function public.rei_avance_etapa(uuid) to authenticated;

-- ---------- PREFACTIBILIDAD ----------
-- El modelo que decide si el proyecto se sostiene. Nada de lo que
-- devuelve está guardado: se calcula cada vez desde los supuestos, y
-- por eso no puede quedar viejo cuando alguien mueve el precio/m².
--
-- Sobre dos decisiones de método que se apartan de la planilla de la
-- que viene este módulo, y por qué:
--
--   1 · LA TASA DEL PERIODO. La planilla descontaba con `WACC / 4`.
--       Eso subestima el descuento: la equivalencia correcta de una
--       tasa efectiva anual a un trimestre es (1+r)^(1/4)−1, no r/4.
--       Con un WACC de 16% la diferencia es de casi medio punto por
--       periodo, y sobre ocho periodos deja de ser un detalle.
--
--   2 · EL SUELO ENTRA AL COSTO. La planilla armaba el costo con obra,
--       indirectos, financieros y comerciales, y dejaba el lote fuera.
--       Un proyecto que no paga el suelo tiene un margen que nadie va
--       a ver. `land_cost` en cero reproduce exactamente aquel modelo.
--
-- La cobertura que devuelve es el mismo proxy de la planilla
-- —ingresos totales contra egresos totales— y se llama «cobertura de
-- egresos», no DSCR. Un DSCR de verdad necesita el calendario de
-- servicio de la deuda, que este módulo todavía no tiene, y ponerle
-- ese nombre a otra cosa sería justo el tipo de cifra que este archivo
-- existe para no producir.
create or replace function public.rei_prefactibilidad(p_feasibility uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  f record; d record; v_company uuid; v_moneda text;
  v_area numeric; v_ingresos numeric;
  v_costo_m2 numeric; v_directo numeric; v_indirecto numeric; v_obra numeric;
  v_financiero numeric; v_comercial numeric; v_total numeric; v_utilidad numeric;
  v_margen numeric; v_unidades_eq int;
  v_ind_pct numeric; v_fin_pct numeric; v_com_pct numeric;
  v_tasa numeric; v_eq_pct numeric;
  v_flujos numeric[]; v_periodos int; v_ppa int;
  v_tir_p numeric; v_tir_a numeric; v_van numeric; v_dscr numeric;
  v_sum_in numeric; v_sum_out numeric; v_n_out int;
  v_min_tir numeric; v_min_margen numeric; v_min_dscr numeric;
  v_cifras jsonb; v_flujo jsonb; v_avisos jsonb := '[]'::jsonb;
  v_veredicto text; v_cumple boolean;
begin
  select * into f from public.rei_feasibility where id = p_feasibility and deleted_at is null;
  if f is null then return '{}'::jsonb; end if;
  v_company := f.company_id;
  if not public.has_company_level(v_company, 60) then return '{}'::jsonb; end if;

  select * into d from public.rei_developments where id = f.development_id;
  select currency into v_moneda from public.companies where id = v_company;

  -- Los supuestos: los del modelo si están, los de la organización si
  -- no. El orden importa y es siempre el mismo.
  v_costo_m2 := coalesce(f.direct_cost_m2,
                  public.rei_parametro(v_company,
                    case when lower(f.product) = 'vis' then 'costo_directo_vis'
                         else 'costo_directo_no_vis' end));
  v_ind_pct  := coalesce(f.indirect_pct,   public.rei_parametro(v_company, 'costos_indirectos_pct'));
  v_fin_pct  := coalesce(f.financial_pct,  public.rei_parametro(v_company, 'gastos_financieros_pct'));
  v_com_pct  := coalesce(f.commercial_pct, public.rei_parametro(v_company, 'gastos_comerciales_pct'));
  v_tasa     := coalesce(f.discount_rate,  public.rei_parametro(v_company, 'wacc'));
  v_eq_pct   := coalesce(f.equilibrium_pct,public.rei_parametro(v_company, 'preventas_minimas'));

  v_min_tir    := public.rei_parametro(v_company, 'tir_minima');
  v_min_margen := public.rei_parametro(v_company, 'margen_minimo');
  v_min_dscr   := public.rei_parametro(v_company, 'dscr_minimo');

  -- Cuerpo del modelo. Cualquier insumo que falte propaga null hasta
  -- la pantalla, que dice «falta un dato» en vez de dibujar un cero.
  v_area       := f.units * f.avg_area_m2;
  v_ingresos   := v_area * f.price_m2;
  v_directo    := v_area * v_costo_m2;
  v_indirecto  := v_directo * v_ind_pct / 100;
  v_obra       := f.land_cost + v_directo + v_indirecto;
  v_financiero := v_obra * v_fin_pct / 100;
  v_comercial  := v_ingresos * v_com_pct / 100;
  v_total      := v_obra + v_financiero + v_comercial;
  v_utilidad   := v_ingresos - v_total;
  v_margen     := case when v_ingresos > 0 then round(v_utilidad / v_ingresos * 100, 2) end;
  v_unidades_eq := case when f.units is not null and v_eq_pct is not null
                        then ceil(f.units * v_eq_pct / 100)::int end;

  -- El flujo. Se carga en positivo y el signo lo pone aquí el vector.
  select array_agg(inflow - outflow order by period_no),
         count(*), coalesce(sum(inflow), 0), coalesce(sum(outflow), 0),
         count(*) filter (where outflow > 0)
    into v_flujos, v_periodos, v_sum_in, v_sum_out, v_n_out
    from public.rei_cashflow_periods where feasibility_id = p_feasibility;

  v_ppa := case f.period_kind when 'mes' then 12 when 'trimestre' then 4
                              when 'semestre' then 2 else 1 end;

  v_tir_p := public.ci_tir(v_flujos);
  v_tir_a := case when v_tir_p is not null
                  then round((power(1 + v_tir_p, v_ppa) - 1) * 100, 2) end;
  v_van   := case when v_flujos is not null and v_tasa is not null
                  then public.ci_van(v_flujos, power(1 + v_tasa/100, 1.0/v_ppa) - 1) end;
  -- Ingresos totales sobre egresos totales, los dos sobre el MISMO
  -- conjunto de periodos. Promediar el numerador sobre nueve periodos
  -- y el denominador sobre los siete que tienen egreso daba una
  -- cobertura que no era ni una cosa ni la otra.
  v_dscr  := case when v_sum_out > 0 then round(v_sum_in / v_sum_out, 2) end;

  v_cifras := jsonb_build_array(
    public.ci_indicador('area_vendible','Área vendible total', v_area,'numero',
      'Unidades × área vendible promedio por unidad',
      jsonb_build_array(public.ci_insumo('Unidades', f.units,'numero'),
                        public.ci_insumo('Área por unidad (m²)', f.avg_area_m2,'numero'))),

    public.ci_indicador('ingresos','Ingresos por ventas', v_ingresos,'dinero',
      'Área vendible total × precio de venta por m²',
      jsonb_build_array(public.ci_insumo('Área vendible (m²)', v_area,'numero'),
                        public.ci_insumo('Precio por m²', f.price_m2,'dinero'))),

    public.ci_indicador('costo_suelo','Costo del suelo', f.land_cost,'dinero',
      'Lo que cuesta el lote: compra, permuta valorizada o aporte',
      jsonb_build_array()),

    public.ci_indicador('costo_directo','Costo directo de obra', v_directo,'dinero',
      'Área vendible × costo directo de construcción por m² ('
        || case when lower(f.product) = 'vis' then 'VIS' else 'No VIS' end || ')',
      jsonb_build_array(public.ci_insumo('Área vendible (m²)', v_area,'numero'),
                        public.ci_insumo('Costo de obra por m²', v_costo_m2,'dinero'))),

    public.ci_indicador('costo_indirecto','Costos indirectos', v_indirecto,'dinero',
      'Costo directo × % de indirectos (diseño, licencias, interventoría, administración)',
      jsonb_build_array(public.ci_insumo('Costo directo', v_directo,'dinero'),
                        public.ci_insumo('% de indirectos', v_ind_pct,'porcentaje'))),

    public.ci_indicador('gastos_financieros','Gastos financieros', v_financiero,'dinero',
      '(Suelo + directo + indirectos) × % de gastos financieros',
      jsonb_build_array(public.ci_insumo('Suelo + obra', v_obra,'dinero'),
                        public.ci_insumo('% financiero', v_fin_pct,'porcentaje'))),

    public.ci_indicador('gastos_comerciales','Gastos comerciales', v_comercial,'dinero',
      'Ingresos por ventas × % de gastos comerciales (comisiones y mercadeo)',
      jsonb_build_array(public.ci_insumo('Ingresos', v_ingresos,'dinero'),
                        public.ci_insumo('% comercial', v_com_pct,'porcentaje'))),

    public.ci_indicador('costo_total','Costo total del proyecto', v_total,'dinero',
      'Suelo + obra directa + indirectos + gastos financieros + gastos comerciales',
      jsonb_build_array(public.ci_insumo('Suelo + obra', v_obra,'dinero'),
                        public.ci_insumo('Financieros', v_financiero,'dinero'),
                        public.ci_insumo('Comerciales', v_comercial,'dinero'))),

    public.ci_indicador('utilidad','Utilidad del proyecto', v_utilidad,'dinero',
      'Ingresos por ventas − costo total del proyecto',
      jsonb_build_array(public.ci_insumo('Ingresos', v_ingresos,'dinero'),
                        public.ci_insumo('Costo total', v_total,'dinero'))),

    public.ci_indicador('margen','Margen sobre ventas', v_margen,'porcentaje',
      'Utilidad ÷ ingresos por ventas',
      jsonb_build_array(public.ci_insumo('Utilidad', v_utilidad,'dinero'),
                        public.ci_insumo('Ingresos', v_ingresos,'dinero'),
                        public.ci_insumo('Mínimo exigido', v_min_margen,'porcentaje')))
      || jsonb_build_object('tono', case when v_margen is null then null
                                         when v_min_margen is null then 'ok'
                                         when v_margen >= v_min_margen then 'ok' else 'malo' end),

    public.ci_indicador('unidades_equilibrio','Unidades en preventa para el punto de equilibrio',
      v_unidades_eq,'numero',
      'Unidades × % de preventas exigido, redondeado hacia arriba',
      jsonb_build_array(public.ci_insumo('Unidades', f.units,'numero'),
                        public.ci_insumo('% de preventas exigido', v_eq_pct,'porcentaje'))),

    public.ci_indicador('tir','TIR anualizada', v_tir_a,'porcentaje',
      'TIR del flujo por periodo, anualizada: (1 + TIR del periodo)^'
        || v_ppa || ' − 1. Periodo: ' || f.period_kind,
      jsonb_build_array(public.ci_insumo('Periodos cargados', v_periodos,'numero'),
                        public.ci_insumo('TIR del periodo', case when v_tir_p is not null
                                          then round(v_tir_p * 100, 2) end,'porcentaje'),
                        public.ci_insumo('Mínimo exigido', v_min_tir,'porcentaje')))
      || jsonb_build_object('tono', case when v_tir_a is null then null
                                         when v_min_tir is null then 'ok'
                                         when v_tir_a >= v_min_tir then 'ok' else 'malo' end),

    public.ci_indicador('van','VAN del proyecto', v_van,'dinero',
      'Flujo neto descontado a la tasa equivalente del periodo: (1 + WACC)^(1/'
        || v_ppa || ') − 1',
      jsonb_build_array(public.ci_insumo('Tasa de descuento anual', v_tasa,'porcentaje'),
                        public.ci_insumo('Periodos cargados', v_periodos,'numero')))
      || jsonb_build_object('tono', case when v_van is null then null
                                         when v_van >= 0 then 'ok' else 'malo' end),

    public.ci_indicador('dscr','Cobertura de egresos', v_dscr,'numero',
      'Ingresos totales del flujo ÷ egresos totales del flujo. '
      'Es un proxy de bancabilidad, no un DSCR: el de verdad necesita el calendario de servicio de la deuda, que este módulo todavía no tiene.',
      jsonb_build_array(public.ci_insumo('Ingresos totales', v_sum_in,'dinero'),
                        public.ci_insumo('Egresos totales', v_sum_out,'dinero'),
                        public.ci_insumo('Mínimo exigido', v_min_dscr,'numero')))
      || jsonb_build_object('tono', case when v_dscr is null then null
                                         when v_min_dscr is null then 'ok'
                                         when v_dscr >= v_min_dscr then 'ok' else 'malo' end)
  );

  select coalesce(jsonb_agg(jsonb_build_object(
           'periodo', period_no, 'egreso', outflow, 'ingreso', inflow,
           'neto', inflow - outflow, 'nota', note) order by period_no), '[]'::jsonb)
    into v_flujo
    from public.rei_cashflow_periods where feasibility_id = p_feasibility;

  -- El veredicto. Solo se emite cuando los cuatro mínimos existen Y
  -- las cuatro cifras se pudieron calcular. Con un dato faltante la
  -- respuesta es «no alcanza para dictaminar», que es distinto de
  -- «no cumple» y muy distinto de un visto bueno.
  if v_margen is null or v_tir_a is null or v_van is null or v_dscr is null
     or v_min_margen is null or v_min_tir is null or v_min_dscr is null then
    v_veredicto := 'Faltan datos para dictaminar';
    v_cumple := null;
  else
    v_cumple := v_tir_a >= v_min_tir and v_van >= 0
                and v_dscr >= v_min_dscr and v_margen >= v_min_margen;
    v_veredicto := case when v_cumple
      then 'Bancable: cumple los cuatro mínimos'
      else 'Ajustar estructura: no cumple uno o más mínimos' end;
  end if;

  if v_periodos is null or v_periodos = 0 then
    v_avisos := v_avisos || public.ci_aviso('sin_flujo','bloqueante',
      'El modelo no tiene flujo de caja',
      'Sin periodos no hay TIR, VAN ni cobertura: quedan las cifras estáticas y nada más. Carga la curva de egresos e ingresos.');
  end if;
  if v_tir_p is null and v_periodos > 0 then
    v_avisos := v_avisos || public.ci_aviso('tir_sin_raiz','aviso',
      'La TIR no se puede calcular con este flujo',
      'Un flujo sin cambio de signo —o con varios— no tiene una TIR única. La cifra queda vacía a propósito: inventar una sería peor.');
  end if;
  if v_costo_m2 is null then
    v_avisos := v_avisos || public.ci_aviso('sin_costo_obra','bloqueante',
      'No hay costo de obra por m²',
      'Ni el modelo lo pisa ni la organización tiene el parámetro cargado. Sin él no hay costo directo y no hay margen.');
  end if;
  if v_tasa is null then
    v_avisos := v_avisos || public.ci_aviso('sin_wacc','aviso',
      'No hay tasa de descuento',
      'Sin WACC no hay VAN. Cárgalo en Supuestos o fíjalo en este modelo.');
  end if;
  if f.land_cost = 0 then
    v_avisos := v_avisos || public.ci_aviso('suelo_en_cero','aviso',
      'El suelo está en cero',
      'Si el lote se aporta o se permuta, vale igual: ponerle su valor comercial es lo que hace comparable el margen de este proyecto con el de otro que sí lo compra.');
  end if;

  return jsonb_build_object(
    'modelo', jsonb_build_object(
      'id', f.id, 'etiqueta', f.label, 'version', f.version, 'estado', f.state,
      'producto', f.product, 'periodo', f.period_kind, 'periodos_por_ano', v_ppa,
      'desarrollo', d.name, 'desarrollo_id', d.id, 'moneda', v_moneda,
      'unidades', f.units, 'area_unidad', f.avg_area_m2, 'precio_m2', f.price_m2),
    'supuestos', jsonb_build_object(
      'costo_m2', v_costo_m2, 'indirectos_pct', v_ind_pct, 'financieros_pct', v_fin_pct,
      'comerciales_pct', v_com_pct, 'wacc', v_tasa, 'preventas_pct', v_eq_pct,
      'tir_minima', v_min_tir, 'margen_minimo', v_min_margen, 'dscr_minimo', v_min_dscr),
    'cifras', v_cifras,
    'flujo', v_flujo,
    'veredicto', jsonb_build_object('texto', v_veredicto, 'cumple', v_cumple),
    'alertas', v_avisos);
end $$;
comment on function public.rei_prefactibilidad(uuid) is
  'Prefactibilidad completa de un desarrollo: cifras con fórmula, flujo, TIR/VAN/cobertura y veredicto. Nada de esto se guarda.';
revoke execute on function public.rei_prefactibilidad(uuid) from public, anon;
grant  execute on function public.rei_prefactibilidad(uuid) to authenticated;

-- ---------- LA CURVA S ----------
-- Sembrar el flujo de un modelo con la curva estándar de la industria.
-- Es un PUNTO DE PARTIDA declarado como tal, no un pronóstico: se
-- reemplaza con el cronograma de obra y el plan de ventas reales en
-- cuanto existan. Existe porque la alternativa —dejar la pestaña
-- vacía— hace que nadie cargue el flujo y el modelo se quede sin TIR.
--
-- No pisa lo que ya hay: si el modelo tiene periodos cargados, no hace
-- nada y lo dice. Borrar el trabajo de alguien para poner un supuesto
-- estándar sería exactamente al revés de lo que esta función es.
create or replace function public.rei_sembrar_curva(p_feasibility uuid)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare
  f record; v_costo jsonb; v_n int; i int; v_total numeric; v_ing numeric;
  -- Curva S de egresos y calendario de recaudo, en 9 periodos.
  v_out numeric[] := array[0.05, 0.15, 0.20, 0.25, 0.20, 0.10, 0.05, 0.00, 0.00];
  v_in  numeric[] := array[0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.10, 0.30, 0.30];
begin
  select * into f from public.rei_feasibility where id = p_feasibility and deleted_at is null;
  if f is null then raise exception 'El modelo no existe'; end if;
  if not public.has_company_level(f.company_id, 60) then
    raise exception 'No tienes permiso para editar este modelo';
  end if;
  if f.state = 'validado' then
    raise exception 'Este modelo está validado. Crea una versión nueva para cambiarlo.';
  end if;

  select count(*) into v_n from public.rei_cashflow_periods where feasibility_id = p_feasibility;
  if v_n > 0 then return 0; end if;

  v_costo := public.rei_prefactibilidad(p_feasibility) -> 'cifras';
  select (c->>'valor')::numeric into v_total
    from jsonb_array_elements(v_costo) c where c->>'clave' = 'costo_total';
  select (c->>'valor')::numeric into v_ing
    from jsonb_array_elements(v_costo) c where c->>'clave' = 'ingresos';
  if v_total is null or v_ing is null then
    raise exception 'Faltan supuestos para repartir: sin costo total ni ingresos no hay curva que sembrar';
  end if;

  for i in 1 .. array_length(v_out, 1) loop
    insert into public.rei_cashflow_periods
      (company_id, feasibility_id, period_no, outflow, inflow, note)
    values (f.company_id, p_feasibility, i - 1,
            round(v_total * v_out[i], 2), round(v_ing * v_in[i], 2),
            'Curva S estándar — reemplazar con el cronograma real');
  end loop;
  return array_length(v_out, 1);
end $$;
comment on function public.rei_sembrar_curva(uuid) is
  'Siembra el flujo con la curva S estándar de la industria. No pisa periodos ya cargados.';
revoke execute on function public.rei_sembrar_curva(uuid) from public, anon;
grant  execute on function public.rei_sembrar_curva(uuid) to authenticated;
