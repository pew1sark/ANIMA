-- 0102b · Los números de la demo tienen que sostenerse.
--
-- El caso de la membresía arrancaba con 120 miembros a 49 y un
-- equipo de 9.000 al mes. El motor lo calculó bien y el resultado
-- fue el correcto: EBITDA de −207.506 en 36 meses. O sea, la demo
-- mostraba un negocio que no existe, y una demo que muestra un
-- negocio imposible no prueba nada: quien la mira concluye que el
-- sistema está mal, no que el negocio lo estaba.
--
-- Se corrige la ESCALA, no el motor: 450 miembros iniciales
-- creciendo 3,5% neto al mes, que es lo que hace falta para que una
-- membresía sostenga un equipo propio. El vehículo de inversión
-- parte con los 325.000 ya comprometidos en caja, en vez de cero.
do $$
declare v_pa uuid; v_ma uuid; v_pc uuid; v_mc uuid; v_ua uuid; v_emp uuid;
begin
  select id into v_emp from public.companies where slug = 'demo-capital-intelligence';
  if v_emp is null then raise notice 'no hay demo cargada'; return; end if;

  select id into v_pa from public.ci_projects where company_id = v_emp and name = '[DEMO] Club de membresía';
  select public.ci_modelo_vigente(v_pa) into v_ma;
  select id into v_ua from public.ci_business_units where project_id = v_pa limit 1;

  update public.ci_models set opening_cash = 60000 where id = v_ma;

  update public.ci_model_lines set quantity = 450, growth_pct = 3.5
   where model_id = v_ma and name = 'Cuotas de membresía';
  update public.ci_model_lines set quantity = 450, growth_pct = 3.5
   where model_id = v_ma and name = 'Costo del beneficio por miembro';
  update public.ci_model_lines set quantity = 32, growth_pct = 3.5
   where model_id = v_ma and name = 'Adquisición de miembros (CAC)';

  update public.ci_scenarios
     set assumptions = jsonb_build_object(
           'precio_mensual', 49, 'miembros_iniciales', 450,
           'alta_mensual_pct', 7, 'churn_mensual_pct', 3.5,
           'crecimiento_neto_pct', 3.5, 'cac', 38,
           'retencion_meses', 28.6, 'ltv', 1092,
           'margen_contribucion_por_miembro', 36.4)
   where project_id = v_pa and kind = 'base';
  update public.ci_scenarios
     set assumptions = assumptions || jsonb_build_object('miembros_iniciales', 380, 'crecimiento_neto_pct', 1.8)
   where project_id = v_pa and kind = 'conservador';
  update public.ci_scenarios
     set assumptions = assumptions || jsonb_build_object('miembros_iniciales', 520, 'crecimiento_neto_pct', 5)
   where project_id = v_pa and kind = 'optimista';

  perform public.ci_generar_periodos_interno(v_ma);

  delete from public.ci_actuals where project_id = v_pa and kind in ('ingreso','costo_directo','gasto_operativo');

  insert into public.ci_actuals (company_id, project_id, business_unit_id, period, kind, category,
      concept, committed_amount, paid_amount, actual_amount, currency)
  select v_emp, v_pa, v_ua, d::date, 'ingreso', 'membresias', 'Cuotas cobradas', 0, 0,
         round(21400 * power(1.031, (extract(month from d) - 1)::int)::numeric, 2), 'USD'
    from generate_series('2026-01-01'::date, '2026-08-01'::date, interval '1 month') d;

  insert into public.ci_actuals (company_id, project_id, business_unit_id, period, kind, category,
      concept, committed_amount, paid_amount, actual_amount, currency)
  select v_emp, v_pa, v_ua, d::date, 'costo_directo', 'servicio', 'Beneficios entregados',
         0, round(5180 * power(1.033, (extract(month from d) - 1)::int)::numeric, 2),
            round(5180 * power(1.033, (extract(month from d) - 1)::int)::numeric, 2), 'USD'
    from generate_series('2026-01-01'::date, '2026-08-01'::date, interval '1 month') d;

  insert into public.ci_actuals (company_id, project_id, business_unit_id, period, kind, category,
      concept, committed_amount, paid_amount, actual_amount, currency)
  select v_emp, v_pa, v_ua, d::date, 'gasto_operativo', 'personal', 'Nómina del equipo',
         9400, 9400, 9400, 'USD'
    from generate_series('2026-01-01'::date, '2026-08-01'::date, interval '1 month') d;

  insert into public.ci_actuals (company_id, project_id, business_unit_id, period, kind, category,
      concept, committed_amount, paid_amount, actual_amount, currency)
  select v_emp, v_pa, v_ua, d::date, 'gasto_operativo', 'marketing', 'Adquisición de miembros',
         1500, 1500, round(1500 * power(1.04, (extract(month from d) - 1)::int)::numeric, 2), 'USD'
    from generate_series('2026-01-01'::date, '2026-08-01'::date, interval '1 month') d;

  select id into v_pc from public.ci_projects where company_id = v_emp and name = '[DEMO] Ronda serie semilla';
  select public.ci_modelo_vigente(v_pc) into v_mc;
  update public.ci_models set opening_cash = 325000 where id = v_mc;
  perform public.ci_generar_periodos_interno(v_mc);
end $$;
