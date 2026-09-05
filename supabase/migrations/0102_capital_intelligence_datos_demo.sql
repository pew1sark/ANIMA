-- ===========================================================
-- 0102 · CAPITAL INTELLIGENCE — datos de demostración
-- -----------------------------------------------------------
-- Una organización aparte, `[DEMO] Capital Intelligence`, con los
-- tres casos de prueba del encargo y un cuarto que existe para ver
-- fallar las validaciones a propósito:
--
--   A · Club de membresía        ingreso recurrente, CAC, churn
--   B · Plataforma multiconcepto tres unidades sobre una misma
--                                infraestructura, en COP
--   C · Ronda serie semilla      valoración, equity, hitos
--   D · Proyecto con inconsistencias  todos los números mal, a propósito
--
-- Va en su PROPIA organización y no dentro de una real por dos
-- razones: no ensucia datos de nadie, y probar el aislamiento entre
-- empresas exige que haya al menos dos. Todo lleva el prefijo
-- `[DEMO]` para que nunca se confunda con información verdadera.
--
-- El bloque empieza borrando la organización si ya existe: los datos
-- de demostración no se acumulan, se reemplazan.
--
-- Antes de los datos, una separación que hacía falta:
-- `ci_generar_periodos` exige permiso —y por tanto sesión— y aquí no
-- hay ninguna. Se parte en dos: la mecánica (`..._interno`) y la
-- política que la protege. La carga demo y cualquier proceso del
-- servidor usan la primera; la aplicación sigue entrando por la
-- segunda.
-- ===========================================================

create or replace function public.ci_generar_periodos_interno(p_model uuid)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare
  m record; l record; i int; k int; v_periodo date;
  v_cant numeric; v_monto numeric; v_creados int := 0; v_ingresos numeric;
begin
  select * into m from public.ci_models where id = p_model and deleted_at is null;
  if m is null then raise exception 'El modelo no existe'; end if;
  if m.state = 'validado' then
    raise exception 'Este modelo está validado. Crea una versión nueva para cambiarlo.';
  end if;

  for l in select * from public.ci_model_lines
            where model_id = p_model and driver <> 'pct_ingresos' order by sort, name loop
    for i in 0 .. m.period_months - 1 loop
      continue when i < l.start_offset;
      k := i - l.start_offset;
      continue when l.frequency = 'unica' and k <> 0;
      continue when l.frequency = 'anual' and (k % 12) <> 0;

      v_periodo := date_trunc('month', (m.period_start + make_interval(months => i))::date)::date;

      if l.driver = 'cantidad_precio' then
        v_cant  := coalesce(l.quantity, 0) * power(1 + coalesce(l.growth_pct, 0) / 100.0, k);
        v_monto := v_cant * coalesce(l.unit_price, 0);
      else
        v_cant  := null;
        v_monto := coalesce(l.amount, 0) * power(1 + coalesce(l.growth_pct, 0) / 100.0, k);
      end if;

      insert into public.ci_model_periods
        (company_id, project_id, model_id, line_id, period, planned_amount, quantity, unit_price, source)
      values (m.company_id, m.project_id, p_model, l.id, v_periodo, round(v_monto, 2),
              round(v_cant, 4), l.unit_price, 'formula')
      on conflict (line_id, period) do update
        set planned_amount = excluded.planned_amount,
            quantity       = excluded.quantity,
            unit_price     = excluded.unit_price
        where ci_model_periods.source = 'formula';
      v_creados := v_creados + 1;
    end loop;
  end loop;

  for l in select * from public.ci_model_lines
            where model_id = p_model and driver = 'pct_ingresos' order by sort, name loop
    for i in 0 .. m.period_months - 1 loop
      continue when i < l.start_offset;
      v_periodo := date_trunc('month', (m.period_start + make_interval(months => i))::date)::date;

      select coalesce(sum(mp.planned_amount), 0) into v_ingresos
        from public.ci_model_periods mp
        join public.ci_model_lines ml on ml.id = mp.line_id
       where mp.model_id = p_model and mp.period = v_periodo and ml.kind = 'ingreso';

      insert into public.ci_model_periods
        (company_id, project_id, model_id, line_id, period, planned_amount, source)
      values (m.company_id, m.project_id, p_model, l.id, v_periodo,
              round(v_ingresos * coalesce(l.pct, 0) / 100.0, 2), 'formula')
      on conflict (line_id, period) do update
        set planned_amount = excluded.planned_amount
        where ci_model_periods.source = 'formula';
      v_creados := v_creados + 1;
    end loop;
  end loop;

  delete from public.ci_model_periods
   where model_id = p_model
     and period >= date_trunc('month', (m.period_start + make_interval(months => m.period_months))::date);

  return v_creados;
end $$;
revoke execute on function public.ci_generar_periodos_interno(uuid) from public, anon, authenticated;

create or replace function public.ci_generar_periodos(p_model uuid)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare v_proj uuid;
begin
  select project_id into v_proj from public.ci_models where id = p_model and deleted_at is null;
  if v_proj is null then raise exception 'El modelo no existe'; end if;
  if not public.ci_edita_proyecto(v_proj) then
    raise exception 'No tienes permiso para editar este proyecto';
  end if;
  return public.ci_generar_periodos_interno(p_model);
end $$;
revoke execute on function public.ci_generar_periodos(uuid) from public, anon;
grant  execute on function public.ci_generar_periodos(uuid) to authenticated;

-- ================= LOS DATOS DEMO =================
do $$
declare
  v_emp uuid; v_plan uuid; v_linea uuid; v_owner uuid; v_rol uuid;
  v_port uuid; v_pa uuid; v_pb uuid; v_pc uuid; v_pd uuid;
  v_ua uuid; v_ub1 uuid; v_ub2 uuid; v_ub3 uuid;
  v_sa uuid; v_sa2 uuid; v_sa3 uuid; v_sb uuid; v_sc uuid; v_sd uuid;
  v_ma uuid; v_mb uuid; v_mc uuid; v_md uuid;
begin
  select id into v_linea from public.product_lines where slug = 'company';
  select id into v_plan  from public.plans where slug = 'enterprise' and product_line_id = v_linea;
  select id into v_owner from public.profiles where email = 'sarkgraff@gmail.com';
  select id into v_rol   from public.roles where slug = 'owner';

  delete from public.companies where slug = 'demo-capital-intelligence';

  insert into public.companies (name, slug, status, country, currency, timezone, locale,
                                product_line_id, tenant_type, created_by, settings)
  values ('[DEMO] Capital Intelligence', 'demo-capital-intelligence', 'active',
          'CO', 'USD', 'America/Bogota', 'es', v_linea, 'advisor', v_owner,
          jsonb_build_object('demo', true,
            'aviso', 'Organización de demostración. Todas las cifras son ficticias.'))
  returning id into v_emp;

  insert into public.company_members (company_id, user_id, role_id, status)
  values (v_emp, v_owner, v_rol, 'active')
  on conflict (company_id, user_id) do update set status = 'active';

  insert into public.subscriptions (company_id, plan_id, status, price_amount, currency, billing_cycle)
  values (v_emp, v_plan, 'activa', 0, 'USD', 'mensual');

  insert into public.company_modules (company_id, module_id, enabled)
  select v_emp, m.id, true from public.modules m
   where m.slug in ('core','crm','finance','capital','support','agenda')
  on conflict (company_id, module_id) do update set enabled = true;

  insert into public.ci_thresholds (company_id, kind, warn_pct, critical_pct)
  values (v_emp, 'general', 8, 15);

  insert into public.ci_exchange_rates (company_id, base_currency, quote_currency, rate, rate_date, source) values
    (v_emp, 'COP', 'USD', 0.00025000, '2026-01-01', '[DEMO] tasa de referencia'),
    (v_emp, 'COP', 'USD', 0.00024100, '2026-07-01', '[DEMO] tasa de referencia'),
    (v_emp, 'CLP', 'USD', 0.00105000, '2026-01-01', '[DEMO] tasa de referencia'),
    (v_emp, 'CRC', 'USD', 0.00190000, '2026-01-01', '[DEMO] tasa de referencia');

  insert into public.ci_portfolios (company_id, name, description, base_currency, manager, status, created_by)
  values (v_emp, '[DEMO] Plataforma gastronómica',
          'Proyectos de un holding gastronómico en evaluación y levantamiento.',
          'USD', 'Dirección de inversiones', 'activo', v_owner)
  returning id into v_port;

  -- ============ CASO A · membresía ============
  insert into public.ci_projects (company_id, portfolio_id, name, project_type, country, city,
      industry, owner, status, stage, description, investment_thesis, problem, business_model,
      revenue_sources, start_date, horizon_months, currency, capital_required, capital_committed,
      equity_offered_pct, pre_money, post_money, instrument, risk_level, created_by)
  values (v_emp, v_port, '[DEMO] Club de membresía', 'nueva_unidad', 'CO', 'Bogotá',
      'Gastronomía', 'Dirección comercial', 'en_levantamiento', 'Levantamiento',
      'Membresía mensual con beneficios en la red de locales del holding.',
      'El ingreso recurrente estabiliza la caja de un negocio que hoy depende del tráfico diario.',
      'La facturación cae 40% entre semana y la base de clientes fieles no está monetizada.',
      'Suscripción mensual con beneficios y cupos reservados.',
      'Cuota mensual · consumo incremental en local',
      '2026-01-01', 36, 'USD', 180000, 60000, 20.0000, 720000, 900000,
      'Equity · acciones preferentes', 'medio', v_owner)
  returning id into v_pa;

  insert into public.ci_business_units (company_id, project_id, name, unit_type, status, launch_date, created_by)
  values (v_emp, v_pa, 'Membresía', 'membresia', 'operando', '2026-01-01', v_owner)
  returning id into v_ua;

  insert into public.ci_scenarios (company_id, project_id, name, kind, is_default, assumptions, created_by)
  values (v_emp, v_pa, 'Base', 'base', true, jsonb_build_object(
            'precio_mensual', 49, 'miembros_iniciales', 120,
            'alta_mensual_pct', 6, 'churn_mensual_pct', 3.5,
            'crecimiento_neto_pct', 2.5, 'cac', 38, 'retencion_meses', 28.6), v_owner)
  returning id into v_sa;
  insert into public.ci_scenarios (company_id, project_id, name, kind, assumptions, created_by)
  values (v_emp, v_pa, 'Conservador', 'conservador', jsonb_build_object(
            'precio_mensual', 45, 'miembros_iniciales', 100,
            'crecimiento_neto_pct', 1.2, 'churn_mensual_pct', 5, 'cac', 46), v_owner)
  returning id into v_sa2;
  insert into public.ci_scenarios (company_id, project_id, name, kind, assumptions, created_by)
  values (v_emp, v_pa, 'Optimista', 'optimista', jsonb_build_object(
            'precio_mensual', 55, 'miembros_iniciales', 140,
            'crecimiento_neto_pct', 4, 'churn_mensual_pct', 2.5, 'cac', 32), v_owner)
  returning id into v_sa3;

  insert into public.ci_models (company_id, project_id, scenario_id, version, label, currency,
      period_start, period_months, opening_cash, discount_rate_pct, tax_rate_pct, state, created_by)
  values (v_emp, v_pa, v_sa, 1, 'Modelo aprobado en comité', 'USD',
      '2026-01-01', 36, 20000, 18, 30, 'borrador', v_owner)
  returning id into v_ma;

  insert into public.ci_model_lines (company_id, project_id, model_id, business_unit_id, kind,
      category, name, driver, quantity, unit_price, amount, pct, growth_pct, frequency, start_offset, sort) values
    (v_emp, v_pa, v_ma, v_ua, 'ingreso','membresias','Cuotas de membresía','cantidad_precio',120,49,null,null,2.5,'mensual',0,10),
    (v_emp, v_pa, v_ma, v_ua, 'costo_directo','servicio','Costo del beneficio por miembro','cantidad_precio',120,11,null,null,2.5,'mensual',0,20),
    (v_emp, v_pa, v_ma, v_ua, 'costo_directo','pasarela','Comisión de la pasarela de pago','pct_ingresos',null,null,null,3.2,0,'mensual',0,21),
    (v_emp, v_pa, v_ma, v_ua, 'gasto_operativo','personal','Equipo de la membresía','monto',null,null,9000,null,0.5,'mensual',0,30),
    (v_emp, v_pa, v_ma, v_ua, 'gasto_operativo','tecnologia','Plataforma y tecnología','monto',null,null,1800,null,0,'mensual',0,31),
    (v_emp, v_pa, v_ma, v_ua, 'gasto_operativo','marketing','Adquisición de miembros (CAC)','cantidad_precio',18,38,null,null,2.5,'mensual',0,32),
    (v_emp, v_pa, v_ma, v_ua, 'depreciacion','depreciacion','Depreciación de la plataforma','monto',null,null,900,null,0,'mensual',6,40),
    (v_emp, v_pa, v_ma, v_ua, 'inversion','tecnologia','Desarrollo de la plataforma','monto',null,null,60000,null,0,'unica',0,50),
    (v_emp, v_pa, v_ma, v_ua, 'inversion','marca','Marca y lanzamiento','monto',null,null,25000,null,0,'unica',0,51);
  perform public.ci_generar_periodos_interno(v_ma);

  insert into public.ci_milestones (company_id, project_id, name, description, due_date, status, owner, amount_conditioned, sort, created_by) values
    (v_emp, v_pa, 'Cierre de la ronda', 'Compromisos firmados por el total objetivo.', '2026-11-01','en_curso','Dirección de inversiones', 120000, 10, v_owner),
    (v_emp, v_pa, '1.000 miembros activos', 'Umbral que libera el segundo tramo.', '2027-02-01','pendiente','Dirección comercial', 60000, 20, v_owner);

  insert into public.ci_actuals (company_id, project_id, business_unit_id, period, kind, category,
      concept, committed_amount, paid_amount, actual_amount, currency, created_by)
  select v_emp, v_pa, v_ua, d::date, 'ingreso', 'membresias', 'Cuotas cobradas',
         0, 0, round(5880 * power(1.021, extract(month from d) - 1)::numeric, 2), 'USD', v_owner
    from generate_series('2026-01-01'::date, '2026-08-01'::date, interval '1 month') d;

  insert into public.ci_actuals (company_id, project_id, business_unit_id, period, kind, category,
      concept, committed_amount, paid_amount, actual_amount, currency, created_by)
  select v_emp, v_pa, v_ua, d::date, 'costo_directo', 'servicio', 'Beneficios entregados',
         0, round(1420 * power(1.024, extract(month from d) - 1)::numeric, 2),
         round(1420 * power(1.024, extract(month from d) - 1)::numeric, 2), 'USD', v_owner
    from generate_series('2026-01-01'::date, '2026-08-01'::date, interval '1 month') d;

  insert into public.ci_actuals (company_id, project_id, business_unit_id, period, kind, category,
      concept, committed_amount, paid_amount, actual_amount, currency, created_by)
  select v_emp, v_pa, v_ua, d::date, 'gasto_operativo', 'personal', 'Nómina del equipo',
         9400, 9400, 9400, 'USD', v_owner
    from generate_series('2026-01-01'::date, '2026-08-01'::date, interval '1 month') d;

  insert into public.ci_actuals (company_id, project_id, business_unit_id, period, kind, category,
      concept, committed_amount, paid_amount, actual_amount, currency, supplier, evidence_url, created_by)
  values (v_emp, v_pa, v_ua, '2026-01-01', 'inversion', 'tecnologia', 'Desarrollo de la plataforma',
          60000, 46000, 60000, 'USD', '[DEMO] Estudio de software', null, v_owner),
         (v_emp, v_pa, v_ua, '2026-02-01', 'inversion', 'marca', 'Identidad y lanzamiento',
          25000, 25000, 27400, 'USD', '[DEMO] Agencia de marca', null, v_owner);

  -- ============ CASO B · plataforma multiconcepto (en COP) ============
  insert into public.ci_projects (company_id, portfolio_id, name, project_type, country, city,
      industry, owner, status, stage, description, investment_thesis, problem, business_model,
      revenue_sources, start_date, horizon_months, currency, capital_required, capital_committed,
      risk_level, created_by)
  values (v_emp, v_port, '[DEMO] Plataforma multiconcepto', 'expansion', 'CO', 'Medellín',
      'Gastronomía', 'Dirección de operaciones', 'ejecucion', 'Ejecución',
      'Una cocina y un local que sostienen tres conceptos distintos.',
      'La infraestructura ya está pagada: cada concepto nuevo solo carga su costo incremental.',
      'La cocina opera al 45% de su capacidad fuera de las horas punta.',
      'Infraestructura compartida con marcas propias por canal.',
      'Salón · delivery · eventos',
      '2026-03-01', 36, 'COP', 1200000000, 400000000, 'medio', v_owner)
  returning id into v_pb;

  insert into public.ci_business_units (company_id, project_id, name, unit_type, status, launch_date, capacity, capacity_unit, created_by)
  values (v_emp, v_pb, 'Restaurante insignia', 'restaurante', 'operando', '2026-03-01', 180, 'm² de salón', v_owner)
  returning id into v_ub1;
  insert into public.ci_business_units (company_id, project_id, name, unit_type, status, launch_date, capacity, capacity_unit, created_by)
  values (v_emp, v_pb, 'Ghost kitchen', 'ghost_kitchen', 'planificada', '2026-06-01', 6, 'estaciones', v_owner)
  returning id into v_ub2;
  insert into public.ci_business_units (company_id, project_id, name, unit_type, status, launch_date, capacity, capacity_unit, created_by)
  values (v_emp, v_pb, 'Eventos', 'eventos', 'planificada', '2026-09-01', 40, 'horas al mes', v_owner)
  returning id into v_ub3;

  insert into public.ci_scenarios (company_id, project_id, name, kind, is_default, assumptions, created_by)
  values (v_emp, v_pb, 'Base', 'base', true, jsonb_build_object(
            'food_cost_pct', 32, 'ticket_promedio_cop', 78000,
            'cubiertos_mes', 4200, 'ocupacion_cocina_pct', 68,
            'apertura_ghost_kitchen', '2026-06', 'apertura_eventos', '2026-09'), v_owner)
  returning id into v_sb;

  insert into public.ci_models (company_id, project_id, scenario_id, version, label, currency,
      period_start, period_months, opening_cash, discount_rate_pct, tax_rate_pct, state, created_by)
  values (v_emp, v_pb, v_sb, 1, 'Plan de expansión', 'COP',
      '2026-03-01', 36, 150000000, 22, 35, 'borrador', v_owner)
  returning id into v_mb;

  insert into public.ci_model_lines (company_id, project_id, model_id, business_unit_id, kind,
      category, name, driver, quantity, unit_price, amount, pct, growth_pct, frequency, start_offset, sort) values
    (v_emp, v_pb, v_mb, v_ub1, 'ingreso','salon','Consumo en salón','cantidad_precio',4200,78000,null,null,1.1,'mensual',0,10),
    (v_emp, v_pb, v_mb, v_ub2, 'ingreso','delivery','Pedidos de ghost kitchen','cantidad_precio',1800,54000,null,null,3.0,'mensual',3,11),
    (v_emp, v_pb, v_mb, v_ub3, 'ingreso','eventos','Eventos privados','cantidad_precio',6,9800000,null,null,1.5,'mensual',6,12),
    (v_emp, v_pb, v_mb, null,  'costo_directo','insumos','Food cost','pct_ingresos',null,null,null,32,0,'mensual',0,20),
    (v_emp, v_pb, v_mb, v_ub2, 'costo_directo','plataformas','Comisión de plataformas de delivery','pct_ingresos',null,null,null,7.5,0,'mensual',3,21),
    (v_emp, v_pb, v_mb, null,  'gasto_operativo','arriendo','Arriendo del local (compartido)','monto',null,null,42000000,null,0,'mensual',0,30),
    (v_emp, v_pb, v_mb, null,  'gasto_operativo','personal','Personal de cocina (compartido)','monto',null,null,86000000,null,0.4,'mensual',0,31),
    (v_emp, v_pb, v_mb, null,  'gasto_operativo','administracion','Administración','monto',null,null,18000000,null,0,'mensual',0,32),
    (v_emp, v_pb, v_mb, v_ub2, 'gasto_operativo','personal','Turno adicional de ghost kitchen','monto',null,null,14000000,null,0,'mensual',3,33),
    (v_emp, v_pb, v_mb, v_ub3, 'gasto_operativo','personal','Producción de eventos','monto',null,null,9000000,null,0,'mensual',6,34),
    (v_emp, v_pb, v_mb, null,  'depreciacion','depreciacion','Depreciación de equipamiento','monto',null,null,11000000,null,0,'mensual',0,40),
    (v_emp, v_pb, v_mb, v_ub1, 'inversion','infraestructura','Remodelación del salón','monto',null,null,520000000,null,0,'unica',0,50),
    (v_emp, v_pb, v_mb, v_ub2, 'inversion','equipamiento','Equipamiento de ghost kitchen','monto',null,null,310000000,null,0,'unica',3,51),
    (v_emp, v_pb, v_mb, v_ub3, 'inversion','equipamiento','Montaje de eventos','monto',null,null,140000000,null,0,'unica',6,52);
  perform public.ci_generar_periodos_interno(v_mb);

  insert into public.ci_milestones (company_id, project_id, name, due_date, status, owner, amount_conditioned, sort, created_by) values
    (v_emp, v_pb, 'Apertura de ghost kitchen', '2026-06-01','hecho','Dirección de operaciones', 310000000, 10, v_owner),
    (v_emp, v_pb, 'Primer evento privado',     '2026-09-15','en_curso','Dirección comercial',   140000000, 20, v_owner),
    (v_emp, v_pb, 'Ocupación de cocina sobre 80%', '2026-12-01','pendiente','Dirección de operaciones', null, 30, v_owner);

  insert into public.ci_actuals (company_id, project_id, business_unit_id, period, kind, category,
      concept, committed_amount, paid_amount, actual_amount, currency, fx_rate, fx_date, base_amount, created_by)
  select v_emp, v_pb, v_ub1, d::date, 'ingreso', 'salon', 'Consumo en salón',
         0, 0, round(318000000 * power(1.014, (extract(epoch from age(d,'2026-03-01'))/2629746)::int)::numeric, 0),
         'COP', 0.00025, d::date,
         round(318000000 * power(1.014, (extract(epoch from age(d,'2026-03-01'))/2629746)::int)::numeric * 0.00025, 2), v_owner
    from generate_series('2026-03-01'::date, '2026-08-01'::date, interval '1 month') d;

  insert into public.ci_actuals (company_id, project_id, business_unit_id, period, kind, category,
      concept, committed_amount, paid_amount, actual_amount, currency, fx_rate, fx_date, base_amount, created_by)
  select v_emp, v_pb, null, d::date, 'gasto_operativo', 'arriendo', 'Arriendo del local',
         44500000, 44500000, 44500000, 'COP', 0.00025, d::date, 11125, v_owner
    from generate_series('2026-03-01'::date, '2026-08-01'::date, interval '1 month') d;

  insert into public.ci_actuals (company_id, project_id, business_unit_id, period, kind, category,
      concept, committed_amount, paid_amount, actual_amount, currency, fx_rate, fx_date, base_amount, supplier, created_by)
  values (v_emp, v_pb, v_ub1, '2026-03-01', 'inversion','infraestructura','Remodelación del salón',
          520000000, 498000000, 561000000, 'COP', 0.00025, '2026-03-01', 140250, '[DEMO] Constructora', v_owner);

  -- ============ CASO C · ronda de inversión ============
  insert into public.ci_projects (company_id, portfolio_id, name, project_type, country, city,
      industry, owner, status, stage, description, investment_thesis, business_model, revenue_sources,
      start_date, horizon_months, currency, capital_required, capital_committed,
      equity_offered_pct, pre_money, post_money, instrument, risk_level, created_by)
  values (v_emp, v_port, '[DEMO] Ronda serie semilla', 'vehiculo_inversion', 'CO', 'Bogotá',
      'Gastronomía', 'Dirección de inversiones', 'comprometido_parcial', 'Negociación',
      'Vehículo que agrupa la expansión de la plataforma a tres ciudades.',
      'Un solo vehículo evita negociar una ronda por local y baja el costo de cada apertura.',
      'Holding operador con participación en cada unidad.',
      'Dividendos de las unidades · management fee',
      '2026-06-01', 60, 'USD', 500000, 325000,
      20.0000, 2000000, 2500000, 'SAFE post-money', 'alto', v_owner)
  returning id into v_pc;

  insert into public.ci_business_units (company_id, project_id, name, unit_type, status, created_by)
  values (v_emp, v_pc, 'Vehículo de expansión', 'otro', 'planificada', v_owner);

  insert into public.ci_scenarios (company_id, project_id, name, kind, is_default, assumptions, created_by)
  values (v_emp, v_pc, 'Base', 'base', true, jsonb_build_object(
            'aperturas_por_ano', 3, 'ticket_por_apertura_usd', 145000,
            'management_fee_pct', 4, 'salida_ano', 5), v_owner)
  returning id into v_sc;

  insert into public.ci_models (company_id, project_id, scenario_id, version, label, currency,
      period_start, period_months, opening_cash, discount_rate_pct, tax_rate_pct, state, created_by)
  values (v_emp, v_pc, v_sc, 1, 'Caso base del vehículo', 'USD',
      '2026-06-01', 60, 0, 25, 30, 'borrador', v_owner)
  returning id into v_mc;

  insert into public.ci_model_lines (company_id, project_id, model_id, kind, category, name,
      driver, quantity, unit_price, amount, pct, growth_pct, frequency, start_offset, sort) values
    (v_emp, v_pc, v_mc, 'ingreso','dividendos','Dividendos de las unidades','cantidad_precio',3,14500,null,null,1.8,'mensual',6,10),
    (v_emp, v_pc, v_mc, 'ingreso','fee','Management fee','pct_ingresos',null,null,null,4,0,'mensual',6,11),
    (v_emp, v_pc, v_mc, 'costo_directo','operacion','Costo de operación de las unidades','pct_ingresos',null,null,null,38,0,'mensual',6,20),
    (v_emp, v_pc, v_mc, 'gasto_operativo','personal','Equipo del vehículo','monto',null,null,12000,null,0.3,'mensual',0,30),
    (v_emp, v_pc, v_mc, 'gasto_operativo','honorarios','Legal y auditoría','monto',null,null,3500,null,0,'mensual',0,31),
    (v_emp, v_pc, v_mc, 'depreciacion','depreciacion','Depreciación de aperturas','monto',null,null,4200,null,0,'mensual',12,40),
    (v_emp, v_pc, v_mc, 'inversion','infraestructura','Apertura de local','monto',null,null,145000,null,0,'anual',6,50);
  perform public.ci_generar_periodos_interno(v_mc);

  insert into public.ci_milestones (company_id, project_id, name, due_date, status, owner, amount_conditioned, sort, created_by) values
    (v_emp, v_pc, 'Primer cierre (60%)',  '2026-10-15','en_curso','Dirección de inversiones', 300000, 10, v_owner),
    (v_emp, v_pc, 'Cierre final',         '2027-01-31','pendiente','Dirección de inversiones', 200000, 20, v_owner),
    (v_emp, v_pc, 'Primera apertura',     '2027-03-01','pendiente','Dirección de operaciones', null,   30, v_owner);

  -- ============ CASO D · el que NO cuadra ============
  insert into public.ci_projects (company_id, portfolio_id, name, project_type, country,
      industry, owner, status, description, start_date, horizon_months, currency,
      capital_required, capital_committed, equity_offered_pct, pre_money, post_money,
      risk_level, created_by)
  values (v_emp, v_port, '[DEMO] Proyecto con inconsistencias', 'turnaround', 'CL',
      'Gastronomía', 'Sin asignar', 'evaluacion',
      'Existe para ver las validaciones trabajando: todos sus números están mal a propósito.',
      '2026-04-01', 24, 'USD', 300000, 350000, 15.0000, 1000000, 1500000, 'alto', v_owner)
  returning id into v_pd;

  insert into public.ci_scenarios (company_id, project_id, name, kind, is_default, created_by)
  values (v_emp, v_pd, 'Sin nombre claro', 'personalizado', true, v_owner)
  returning id into v_sd;

  insert into public.ci_models (company_id, project_id, scenario_id, version, currency,
      period_start, period_months, opening_cash, state, created_by)
  values (v_emp, v_pd, v_sd, 1, 'USD', '2026-04-01', 24, null, 'borrador', v_owner)
  returning id into v_md;

  insert into public.ci_model_lines (company_id, project_id, model_id, kind, category, name,
      driver, quantity, unit_price, amount, growth_pct, frequency, sort) values
    (v_emp, v_pd, v_md, 'ingreso','ventas','Menú ejecutivo','cantidad_precio',900,18,null,1,'mensual',10),
    (v_emp, v_pd, v_md, 'ingreso','ventas','Menú ejecutivo','cantidad_precio',900,24,null,1,'mensual',11),
    (v_emp, v_pd, v_md, 'ingreso','otros','Otros ingresos','monto',null,null,4000,0,'mensual',12),
    (v_emp, v_pd, v_md, 'costo_directo','insumos','Insumos','monto',null,null,7000,0,'mensual',20),
    (v_emp, v_pd, v_md, 'inversion','equipamiento','Cocina','monto',null,null,90000,0,'unica',50);
  perform public.ci_generar_periodos_interno(v_md);

  insert into public.ci_actuals (company_id, project_id, period, kind, category, concept,
      actual_amount, currency, created_by)
  values (v_emp, v_pd, '2026-05-01', 'gasto_operativo', 'otros', 'Gasto en pesos chilenos sin tasa',
          2400000, 'CLP', v_owner);

  raise notice '[DEMO] Capital Intelligence cargado: empresa %', v_emp;
end $$;
