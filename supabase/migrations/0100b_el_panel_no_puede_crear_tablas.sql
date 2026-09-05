-- ===========================================================
-- 0100b · El panel no puede crear tablas
-- -----------------------------------------------------------
-- `ci_resumen()` nació resolviendo la lista de proyectos filtrados
-- en una tabla temporal. PostgreSQL no lo permite:
--
--   ERROR 0A000: CREATE TABLE is not allowed in a non-volatile function
--
-- La salida fácil era declarar la función VOLATILE. Habría
-- funcionado y habría sido mentir: `ci_resumen` solo lee, y esa
-- etiqueta es lo que le dice al planificador —y a quien lea el
-- código— que llamarla no cambia nada.
--
-- La lista pasa a ser una función que devuelve filas. Se llama
-- varias veces dentro del panel, y a esta escala —decenas de
-- proyectos por organización— eso cuesta menos que la complejidad
-- de arrastrar una tabla temporal por toda la consulta.
--
-- `ci_ve_proyecto` va EXPLÍCITO en el filtro: estas funciones son
-- SECURITY DEFINER, RLS no las protege, y aquí es donde se decide
-- que un inversionista invitado a un proyecto no vea el panel
-- entero de la firma.
-- ===========================================================

drop function if exists public.ci_tmp_probe();

create or replace function public.ci_proyectos_filtrados(p_company uuid, p_filtros jsonb)
returns table (id uuid, name text, code text, status text, currency text, risk_level text,
               capital_required numeric, capital_committed numeric, modelo uuid)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.id, p.name, p.code, p.status, p.currency, p.risk_level,
         p.capital_required, p.capital_committed, public.ci_modelo_vigente(p.id)
    from public.ci_projects p
   where p.company_id = p_company and p.deleted_at is null
     and public.ci_ve_proyecto(p.id)
     and (p_filtros->>'portafolio' is null or p.portfolio_id = (p_filtros->>'portafolio')::uuid)
     and (p_filtros->>'proyecto'   is null or p.id           = (p_filtros->>'proyecto')::uuid)
     and (p_filtros->>'pais'       is null or p.country      = p_filtros->>'pais')
     and (p_filtros->>'moneda'     is null or p.currency     = p_filtros->>'moneda')
     and (p_filtros->>'estado'     is null or p.status       = p_filtros->>'estado');
$$;
revoke execute on function public.ci_proyectos_filtrados(uuid, jsonb) from public, anon;
grant  execute on function public.ci_proyectos_filtrados(uuid, jsonb) to authenticated;

-- El panel ejecutivo. Devuelve la MISMA forma que `resumen_modulo()`
-- —cifras, series, listas— para que la pantalla que ya sabe dibujar
-- resúmenes de módulo dibuje este sin aprender nada nuevo. Encima
-- agrega `alertas` y `periodo`, que son suyos.
create or replace function public.ci_resumen(p_company uuid, p_filtros jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_moneda text; v_desde date; v_hasta date;
  v_cifras jsonb; v_series jsonb; v_listas jsonb; v_alertas jsonb := '[]'::jsonb;
  v_solicitado numeric; v_comprometido numeric; v_utilizado numeric;
  v_ing_proy numeric; v_ing_real numeric; v_ebitda numeric;
  v_presu numeric; v_real numeric;
  v_activos int; v_riesgo int; v_sin_tasa int; v_sin_modelo int;
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
         count(*) filter (where status not in ('cerrado','rechazado','pausado','borrador')),
         count(*) filter (where risk_level = 'alto' or status = 'pausado'),
         count(*) filter (where currency <> v_moneda
                            and public.ci_convertir(p_company, 1, currency, v_moneda) is null),
         count(*) filter (where modelo is null)
    into v_solicitado, v_comprometido, v_activos, v_riesgo, v_sin_tasa, v_sin_modelo
    from public.ci_proyectos_filtrados(p_company, p_filtros);

  select coalesce(sum(public.ci_convertir(p_company, a.paid_amount, a.currency, v_moneda, a.period)), 0)
    into v_utilizado
    from public.ci_actuals a
    join public.ci_proyectos_filtrados(p_company, p_filtros) t on t.id = a.project_id
   where a.kind = 'inversion'
     and (p_filtros->>'unidad' is null or a.business_unit_id = (p_filtros->>'unidad')::uuid);

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
   where a.period between v_desde and v_hasta
     and (p_filtros->>'unidad' is null or a.business_unit_id = (p_filtros->>'unidad')::uuid);

  select coalesce(sum(public.ci_convertir(p_company, mp.planned_amount, t.currency, v_moneda, mp.period))
                  filter (where ml.kind = 'ingreso'), 0),
         coalesce(sum(public.ci_convertir(p_company, mp.planned_amount, t.currency, v_moneda, mp.period))
                  filter (where ml.kind <> 'inversion'), 0)
    into v_ing_proy, v_presu
    from public.ci_model_periods mp
    join public.ci_model_lines ml on ml.id = mp.line_id
    join public.ci_proyectos_filtrados(p_company, p_filtros) t on t.modelo = mp.model_id
   where mp.period between v_desde and v_hasta
     and (p_filtros->>'unidad' is null or ml.business_unit_id = (p_filtros->>'unidad')::uuid);

  v_desv := case when v_presu <> 0 then round((v_real - v_presu) / abs(v_presu) * 100, 1) end;

  v_cifras := jsonb_build_array(
    jsonb_build_object('etiqueta','Capital solicitado','formato','dinero','valor',v_solicitado),
    jsonb_build_object('etiqueta','Capital comprometido','formato','dinero','valor',v_comprometido,
      'nota', case when v_solicitado > 0
                   then round(v_comprometido / v_solicitado * 100)::text || '% del objetivo' end),
    jsonb_build_object('etiqueta','Capital pendiente','formato','dinero','tono','aviso',
      'valor', greatest(v_solicitado - v_comprometido, 0)),
    jsonb_build_object('etiqueta','Capital utilizado','formato','dinero','valor',v_utilizado),
    jsonb_build_object('etiqueta','Capital disponible','formato','dinero',
      'valor', v_comprometido - v_utilizado),
    jsonb_build_object('etiqueta','Ingresos proyectados','formato','dinero','valor',v_ing_proy),
    jsonb_build_object('etiqueta','Ingresos reales','formato','dinero','valor',v_ing_real,
      'nota', case when v_ing_proy > 0
                   then round(v_ing_real / v_ing_proy * 100)::text || '% de lo proyectado' end),
    jsonb_build_object('etiqueta','EBITDA real','formato','dinero','valor',v_ebitda),
    jsonb_build_object('etiqueta','Margen EBITDA','formato','porcentaje',
      'valor', case when v_ing_real > 0 then round(v_ebitda / v_ing_real * 100, 1) else 0 end),
    jsonb_build_object('etiqueta','Desviación presupuestaria','formato','porcentaje',
      'tono', case when abs(coalesce(v_desv,0)) >= v_crit then 'malo'
                   when abs(coalesce(v_desv,0)) >= v_warn then 'aviso' else 'ok' end,
      'valor', coalesce(v_desv, 0), 'nota','real contra presupuesto vigente'),
    jsonb_build_object('etiqueta','Proyectos activos','formato','numero','valor',v_activos),
    jsonb_build_object('etiqueta','Proyectos en riesgo','formato','numero','tono','malo','valor',v_riesgo)
  );

  select jsonb_build_array(
    jsonb_build_object('titulo','Ingresos: proyectado contra real',
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
    jsonb_build_object('titulo','Proyectos','nota','Capital y avance de cada uno',
      'columnas', jsonb_build_array(
        jsonb_build_object('k','proyecto','t','Proyecto'),
        jsonb_build_object('k','estado','t','Estado'),
        jsonb_build_object('k','solicitado','t','Solicitado','formato','dinero'),
        jsonb_build_object('k','captado','t','Captado','formato','dinero'),
        jsonb_build_object('k','avance','t','% captado','formato','porcentaje'),
        jsonb_build_object('k','riesgo','t','Riesgo')),
      'filas', coalesce((select jsonb_agg(jsonb_build_object(
                  'proyecto', name, 'estado', status,
                  'solicitado', public.ci_convertir(p_company, capital_required, currency, v_moneda),
                  'captado',    public.ci_convertir(p_company, capital_committed, currency, v_moneda),
                  'avance', case when capital_required > 0
                                 then round(capital_committed / capital_required * 100, 1) else 0 end,
                  'riesgo', risk_level) order by capital_required desc)
                from public.ci_proyectos_filtrados(p_company, p_filtros)), '[]'::jsonb)),

    jsonb_build_object('titulo','Próximos hitos','nota','Lo que viene en los siguientes 90 días',
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
    'cifras', v_cifras, 'series', v_series, 'listas', v_listas, 'alertas', v_alertas);
end $$;
revoke execute on function public.ci_resumen(uuid, jsonb) from public, anon;
grant  execute on function public.ci_resumen(uuid, jsonb) to authenticated;
