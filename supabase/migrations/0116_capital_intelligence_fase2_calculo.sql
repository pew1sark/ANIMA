-- ===========================================================
-- 0116 · FASE 2 · el cálculo de una ronda
-- -----------------------------------------------------------
-- Las cuatro fórmulas mínimas que pidió el encargo, escritas una vez:
--
--   post-money          = pre-money + inversión
--   % del inversionista = inversión ÷ post-money
--   capital pendiente   = objetivo − confirmado
--   % levantado         = confirmado ÷ objetivo
--
-- Y una quinta que no estaba pedida y hace falta: la DILUCIÓN de cada
-- socio actual = su % × (pre-money ÷ post-money). Sin ella, «te
-- diluyes un poco» es lo único que se le puede decir a un fundador, y
-- esa es la conversación más difícil de toda una ronda.
--
-- «Confirmado» es, por inversionista, el MAYOR entre lo comprometido y
-- lo ya invertido. Sumar los dos contaría dos veces a quien ya puso el
-- dinero; quedarse solo con lo invertido borraría a quien firmó y aún
-- no transfirió.
-- ===========================================================

create or replace function public.ci_validar_ronda(p_round uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  r record; a jsonb := '[]'::jsonb;
  v_conf numeric; v_uof numeric; v_uof_n int; v_equity numeric; v_dif numeric;
begin
  select * into r from public.ci_capital_rounds where id = p_round and deleted_at is null;
  if r is null then return '[]'::jsonb; end if;
  if not public.ci_ve_proyecto(r.project_id) then return '[]'::jsonb; end if;

  select coalesce(sum(greatest(committed_amount, invested_amount)), 0)
    into v_conf from public.ci_investor_commitments where round_id = p_round;
  select coalesce(sum(budget_amount), 0), count(*)
    into v_uof, v_uof_n from public.ci_use_of_funds where round_id = p_round;

  if r.pre_money is not null and r.target_amount > 0 then
    if r.post_money is null then
      a := a || public.ci_aviso('sin_post_money','aviso','Falta la valoración post-money',
        'Con pre-money y objetivo declarados, la post-money debería ser ' ||
        to_char(r.pre_money + r.target_amount,'FM999999999999.00') || '.');
    elsif abs(r.post_money - (r.pre_money + r.target_amount)) > 0.01 then
      a := a || public.ci_aviso('valoracion_incoherente','bloqueante','La valoración no cuadra',
        'Post-money declarada: ' || to_char(r.post_money,'FM999999999999.00') ||
        '. Pre-money + objetivo: ' || to_char(r.pre_money + r.target_amount,'FM999999999999.00') || '.');
    end if;
  end if;

  if r.post_money is not null and r.post_money > 0 and r.equity_offered_pct is not null then
    v_equity := round(r.target_amount / r.post_money * 100, 2);
    if abs(r.equity_offered_pct - v_equity) > 0.5 then
      a := a || public.ci_aviso('equity_incoherente','bloqueante','El equity ofrecido no calza con la valoración',
        'Ofrecido: ' || r.equity_offered_pct || '%. Objetivo ÷ post-money da ' || v_equity || '%.');
    end if;
  end if;

  if v_conf > r.target_amount and r.target_amount > 0 then
    a := a || public.ci_aviso('capital_excedido','bloqueante','Lo confirmado supera al objetivo',
      'Confirmado ' || to_char(v_conf,'FM999999999999.00') || ' sobre un objetivo de ' ||
      to_char(r.target_amount,'FM999999999999.00') || '. O sube el objetivo, o sobra un compromiso.');
  end if;

  if v_uof_n = 0 then
    a := a || public.ci_aviso('sin_uso_de_fondos','aviso','La ronda no dice en qué se va a usar el dinero',
      'Es la primera pregunta de cualquier inversionista, y sin el desglose no hay contra qué medir la ejecución después.');
  else
    v_dif := v_uof - r.target_amount;
    if abs(v_dif) > greatest(r.target_amount * 0.01, 1) then
      a := a || public.ci_aviso('uso_de_fondos_descuadrado','bloqueante',
        'El uso de fondos no suma el objetivo',
        'Reparte ' || to_char(v_uof,'FM999999999999.00') || ' sobre un objetivo de ' ||
        to_char(r.target_amount,'FM999999999999.00') || ': ' ||
        case when v_dif > 0 then 'sobran ' else 'faltan ' end ||
        to_char(abs(v_dif),'FM999999999999.00') || '.');
    end if;
  end if;

  if r.status = 'abierta' and r.target_close_date is null then
    a := a || public.ci_aviso('sin_fecha_de_cierre','aviso','La ronda está abierta y no tiene fecha objetivo de cierre',
      'Una ronda sin fecha no se cierra: se apaga.');
  end if;
  if r.status = 'cerrada' and v_conf < r.target_amount then
    a := a || public.ci_aviso('cerrada_incompleta','aviso','La ronda está cerrada por debajo del objetivo',
      'Confirmado ' || to_char(v_conf,'FM999999999999.00') || ' de ' ||
      to_char(r.target_amount,'FM999999999999.00') || '. Conviene dejar dicho por qué.');
  end if;

  if exists (select 1 from public.ci_investor_commitments
              where round_id = p_round and stage in ('comprometido','cerrado')
                and greatest(committed_amount, invested_amount) = 0) then
    a := a || public.ci_aviso('comprometido_sin_monto','aviso','Hay compromisos sin monto',
      'Un inversionista marcado como comprometido y con cero no suma al capital confirmado.');
  end if;

  return a;
end $$;
revoke execute on function public.ci_validar_ronda(uuid) from public, anon;
grant  execute on function public.ci_validar_ronda(uuid) to authenticated;

create or replace function public.ci_ronda_calculada(p_round uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  r record; pr record;
  v_conf numeric; v_inv numeric; v_pot numeric; v_forecast numeric;
  v_uof numeric; v_uof_usado numeric; v_uof_comp numeric;
  v_equity numeric; v_n int;
begin
  select * into r from public.ci_capital_rounds where id = p_round and deleted_at is null;
  if r is null then return '{}'::jsonb; end if;
  if not public.ci_ve_proyecto(r.project_id) then return '{}'::jsonb; end if;
  select * into pr from public.ci_projects where id = r.project_id;

  select coalesce(sum(greatest(committed_amount, invested_amount)), 0),
         coalesce(sum(invested_amount), 0),
         coalesce(sum(potential_amount), 0),
         coalesce(sum(potential_amount * probability_pct / 100.0), 0),
         count(*)
    into v_conf, v_inv, v_pot, v_forecast, v_n
    from public.ci_investor_commitments where round_id = p_round;

  select coalesce(sum(budget_amount), 0), coalesce(sum(used_amount), 0), coalesce(sum(committed_amount), 0)
    into v_uof, v_uof_usado, v_uof_comp
    from public.ci_use_of_funds where round_id = p_round;

  v_equity := case when r.post_money > 0 then round(r.target_amount / r.post_money * 100, 4) end;

  return jsonb_build_object(
    'ronda', jsonb_build_object('id', r.id, 'nombre', r.name, 'moneda', r.currency,
              'estado', r.status, 'instrumento', r.instrument, 'responsable', r.owner,
              'apertura', r.open_date, 'cierre_objetivo', r.target_close_date, 'cerrada_en', r.closed_date,
              'nota_uso_fondos', r.use_of_funds_note, 'notas', r.notes),
    'proyecto', jsonb_build_object('id', pr.id, 'nombre', pr.name, 'moneda', pr.currency),

    'indicadores', jsonb_build_array(
      public.ci_indicador('objetivo','Monto objetivo', r.target_amount,'dinero',
        'Lo declarado en la ronda',
        jsonb_build_array(public.ci_insumo('Inversionistas en la ronda', v_n,'numero'))),
      public.ci_indicador('confirmado','Capital confirmado', v_conf,'dinero',
        'Suma, por inversionista, del mayor entre lo comprometido y lo ya invertido',
        jsonb_build_array(public.ci_insumo('Ya invertido', v_inv,'dinero'),
                          public.ci_insumo('Objetivo', r.target_amount,'dinero'))),
      public.ci_indicador('pendiente','Capital pendiente',
        greatest(r.target_amount - v_conf, 0),'dinero',
        'Objetivo − capital confirmado',
        jsonb_build_array(public.ci_insumo('Objetivo', r.target_amount,'dinero'),
                          public.ci_insumo('Confirmado', v_conf,'dinero'))),
      public.ci_indicador('levantado','% levantado',
        case when r.target_amount > 0 then round(v_conf / r.target_amount * 100, 1) end,'porcentaje',
        'Capital confirmado ÷ objetivo × 100',
        jsonb_build_array(public.ci_insumo('Confirmado', v_conf,'dinero'),
                          public.ci_insumo('Objetivo', r.target_amount,'dinero'))),
      public.ci_indicador('forecast','Forecast ponderado', v_forecast,'dinero',
        'Σ (monto potencial × probabilidad de cierre) de cada inversionista del pipeline',
        jsonb_build_array(public.ci_insumo('Potencial sin ponderar', v_pot,'numero'),
                          public.ci_insumo('Inversionistas', v_n,'numero'))),
      public.ci_indicador('pre_money','Valoración pre-money', r.pre_money,'dinero',
        'Lo que vale el proyecto antes de que entre este dinero', '[]'::jsonb),
      public.ci_indicador('post_money','Valoración post-money', r.post_money,'dinero',
        'Pre-money + inversión',
        jsonb_build_array(public.ci_insumo('Pre-money', r.pre_money,'dinero'),
                          public.ci_insumo('Objetivo', r.target_amount,'dinero'))),
      public.ci_indicador('equity_implicito','Equity que compra el objetivo', v_equity,'porcentaje',
        'Objetivo ÷ post-money × 100. Si no coincide con el equity ofrecido, uno de los dos está mal',
        jsonb_build_array(public.ci_insumo('Equity ofrecido', r.equity_offered_pct,'porcentaje'),
                          public.ci_insumo('Post-money', r.post_money,'dinero'))),
      public.ci_indicador('uso_presupuestado','Uso de fondos presupuestado', v_uof,'dinero',
        'Suma de las categorías del uso de fondos. Tiene que cuadrar con el objetivo',
        jsonb_build_array(public.ci_insumo('Objetivo', r.target_amount,'dinero'),
                          public.ci_insumo('Diferencia', v_uof - r.target_amount,'dinero'))),
      public.ci_indicador('uso_utilizado','Uso de fondos ejecutado', v_uof_usado,'dinero',
        'Suma de lo ya gastado por categoría',
        jsonb_build_array(public.ci_insumo('Comprometido', v_uof_comp,'dinero'),
                          public.ci_insumo('Presupuestado', v_uof,'dinero')))
    ),

    'pipeline', coalesce((
      select jsonb_agg(x order by x->>'orden') from (
        select jsonb_build_object(
          'etapa', e.stage, 'orden', e.orden,
          'inversionistas', count(c.id),
          'potencial', coalesce(sum(c.potential_amount), 0),
          'comprometido', coalesce(sum(c.committed_amount), 0),
          'ponderado', coalesce(sum(c.potential_amount * c.probability_pct / 100.0), 0)) x
          from (values ('identificado',1),('contactado',2),('interesado',3),('reunion',4),
                       ('informacion_enviada',5),('due_diligence',6),('negociacion',7),
                       ('comprometido',8),('cerrado',9),('no_interesado',10),('en_pausa',11))
                 as e(stage, orden)
          left join public.ci_investor_commitments c
                 on c.round_id = p_round and c.stage = e.stage
         group by e.stage, e.orden) s), '[]'::jsonb),

    'inversionistas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'nombre', i.name, 'tipo', i.kind, 'pais', i.country,
               'etapa', c.stage, 'potencial', c.potential_amount,
               'comprometido', c.committed_amount, 'invertido', c.invested_amount,
               'probabilidad', c.probability_pct,
               'ponderado', round(c.potential_amount * c.probability_pct / 100.0, 2),
               'ultimo_contacto', c.last_contact, 'proxima_accion', c.next_action,
               'proxima_fecha', c.next_action_date, 'responsable', c.owner)
             order by c.potential_amount desc)
        from public.ci_investor_commitments c
        join public.ci_investors i on i.id = c.investor_id
       where c.round_id = p_round), '[]'::jsonb),

    'uso_de_fondos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', u.id, 'categoria', u.category, 'descripcion', u.description,
               'presupuesto', u.budget_amount,
               'pct', case when r.target_amount > 0
                           then round(u.budget_amount / r.target_amount * 100, 1) end,
               'comprometido', u.committed_amount, 'utilizado', u.used_amount,
               'saldo', u.budget_amount - u.used_amount,
               'proveedor', u.supplier, 'evidencia', u.evidence_url, 'fecha', u.spent_at)
             order by u.sort, u.category)
        from public.ci_use_of_funds u where u.round_id = p_round), '[]'::jsonb),

    'avisos', public.ci_validar_ronda(p_round));
end $$;
revoke execute on function public.ci_ronda_calculada(uuid) from public, anon;
grant  execute on function public.ci_ronda_calculada(uuid) to authenticated;

create or replace function public.ci_simular_dilucion(p_round uuid, p_monto numeric default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  r record; v_monto numeric; v_pre numeric; v_post numeric; v_nuevo numeric; v_factor numeric;
  v_socios jsonb; v_suma numeric;
begin
  select * into r from public.ci_capital_rounds where id = p_round and deleted_at is null;
  if r is null then return '{}'::jsonb; end if;
  if not public.ci_ve_proyecto(r.project_id) then return '{}'::jsonb; end if;

  /* Se simula con lo confirmado si ya hay algo; si no, con el objetivo.
     Es la pregunta que se hace de verdad: «si cierro hoy, ¿cómo quedo?». */
  select coalesce(p_monto,
                  nullif((select sum(greatest(committed_amount, invested_amount))
                            from public.ci_investor_commitments where round_id = p_round), 0),
                  r.target_amount)
    into v_monto;

  v_pre := r.pre_money;
  if v_pre is null or v_pre <= 0 then
    return jsonb_build_object('error',
      'La ronda no tiene valoración pre-money. Sin ella no hay dilución que calcular: el porcentaje que compra el dinero depende de cuánto vale lo que ya existe.');
  end if;

  v_post   := v_pre + v_monto;
  v_nuevo  := round(v_monto / v_post * 100, 4);
  v_factor := v_pre / v_post;

  select coalesce(sum(pct), 0) into v_suma
    from public.ci_shareholders where project_id = r.project_id;

  select jsonb_agg(jsonb_build_object(
           'socio', s.name, 'tipo', s.kind,
           'antes', s.pct,
           'despues', round(s.pct * v_factor, 4),
           'dilucion', round(s.pct - s.pct * v_factor, 4),
           'invertido', s.invested, 'derechos', s.rights)
         order by s.sort, s.pct desc)
    into v_socios
    from public.ci_shareholders s where s.project_id = r.project_id;

  return jsonb_build_object(
    'ronda', jsonb_build_object('id', r.id, 'nombre', r.name, 'moneda', r.currency),
    'supuesto', jsonb_build_object('monto', v_monto,
      'origen', case when p_monto is not null then 'monto indicado a mano'
                     when v_monto = r.target_amount then 'el objetivo de la ronda'
                     else 'lo confirmado hasta hoy' end),
    'indicadores', jsonb_build_array(
      public.ci_indicador('pre_money','Pre-money', v_pre,'dinero',
        'Lo que vale el proyecto antes de que entre el dinero', '[]'::jsonb),
      public.ci_indicador('inversion','Inversión simulada', v_monto,'dinero',
        'El monto con el que se simula la entrada', '[]'::jsonb),
      public.ci_indicador('post_money','Post-money', v_post,'dinero',
        'Pre-money + inversión',
        jsonb_build_array(public.ci_insumo('Pre-money', v_pre,'dinero'),
                          public.ci_insumo('Inversión', v_monto,'dinero'))),
      public.ci_indicador('entrante','% del nuevo inversionista', v_nuevo,'porcentaje',
        'Inversión ÷ post-money × 100',
        jsonb_build_array(public.ci_insumo('Inversión', v_monto,'dinero'),
                          public.ci_insumo('Post-money', v_post,'dinero'))),
      public.ci_indicador('factor','Factor de dilución', round(v_factor * 100, 2),'porcentaje',
        'Pre-money ÷ post-money. Cada socio actual conserva este porcentaje de lo que tenía',
        jsonb_build_array(public.ci_insumo('Pre-money', v_pre,'dinero'),
                          public.ci_insumo('Post-money', v_post,'dinero')))),
    'socios', coalesce(v_socios, '[]'::jsonb),
    'aviso', case
      when v_socios is null then 'El cap table está vacío: carga los socios actuales en la pestaña Cap table para ver la dilución de cada uno.'
      when abs(v_suma - 100) > 0.5 then 'Los socios actuales suman ' || round(v_suma,2) ||
           '% y no 100%. La dilución se calcula igual, pero el cap table está incompleto.'
      end);
end $$;
revoke execute on function public.ci_simular_dilucion(uuid, numeric) from public, anon;
grant  execute on function public.ci_simular_dilucion(uuid, numeric) to authenticated;

create or replace function public.ci_pipeline(p_company uuid, p_filtros jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_moneda text;
begin
  if not public.has_company_level(p_company, 60) then return '{}'::jsonb; end if;
  select currency into v_moneda from public.companies where id = p_company;

  return jsonb_build_object(
    'moneda', v_moneda,
    'etapas', coalesce((
      select jsonb_agg(x order by x->>'orden') from (
        select jsonb_build_object('etapa', e.stage, 'orden', e.orden,
                 'inversionistas', count(c.id),
                 'potencial', coalesce(sum(public.ci_convertir(p_company, c.potential_amount, c.currency, v_moneda)), 0),
                 'ponderado', coalesce(sum(public.ci_convertir(p_company, c.potential_amount * c.probability_pct / 100.0, c.currency, v_moneda)), 0)) x
          from (values ('identificado',1),('contactado',2),('interesado',3),('reunion',4),
                       ('informacion_enviada',5),('due_diligence',6),('negociacion',7),
                       ('comprometido',8),('cerrado',9),('no_interesado',10),('en_pausa',11))
                 as e(stage, orden)
          left join public.ci_investor_commitments c on c.stage = e.stage
               and c.company_id = p_company
               and public.ci_ve_proyecto(c.project_id)
               and (p_filtros->>'proyecto' is null or c.project_id = (p_filtros->>'proyecto')::uuid)
         group by e.stage, e.orden) s), '[]'::jsonb),
    'proximas_acciones', coalesce((
      select jsonb_agg(jsonb_build_object(
               'inversionista', i.name, 'proyecto', p.name, 'etapa', c.stage,
               'accion', c.next_action, 'fecha', c.next_action_date,
               'responsable', c.owner,
               'potencial', public.ci_convertir(p_company, c.potential_amount, c.currency, v_moneda))
             order by c.next_action_date)
        from public.ci_investor_commitments c
        join public.ci_investors i on i.id = c.investor_id
        join public.ci_projects p on p.id = c.project_id
       where c.company_id = p_company and public.ci_ve_proyecto(c.project_id)
         and c.next_action_date is not null
         and c.stage not in ('cerrado','no_interesado')
         and c.next_action_date <= current_date + 30), '[]'::jsonb));
end $$;
revoke execute on function public.ci_pipeline(uuid, jsonb) from public, anon;
grant  execute on function public.ci_pipeline(uuid, jsonb) to authenticated;
