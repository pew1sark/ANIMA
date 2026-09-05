-- 0103b · «Ingresos proyectados» y «Ingresos reales» tienen que
--         medir el mismo tramo de tiempo.
--
-- 0103 arregló la desviación pero dejó a medias la tarjeta de
-- ingresos: seguía sumando la proyección de la ventana entera
-- —incluidos los meses que no han ocurrido— y poniéndole al lado
-- "X% de lo proyectado" contra ocho meses de ejecución. Dos cifras
-- correctas que juntas dicen algo falso.
--
-- Ahora las dos llegan hasta el mes en curso, y la proyección
-- completa del horizonte se mira donde corresponde: en la serie
-- mensual, que muestra las dos curvas mes a mes.
do $$
declare v_src text; v_nuevo text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ci_resumen';

  v_nuevo := replace(v_src,
    'filter (where ml.kind = ''ingreso''), 0),
         coalesce(sum(public.ci_convertir(p_company, mp.planned_amount, t.currency, v_moneda, mp.period))',
    'filter (where ml.kind = ''ingreso''
                              and mp.period <= date_trunc(''month'', current_date)::date), 0),
         coalesce(sum(public.ci_convertir(p_company, mp.planned_amount, t.currency, v_moneda, mp.period))');

  v_nuevo := replace(v_nuevo,
    '''etiqueta'',''Ingresos proyectados'',''formato'',''dinero'',''valor'',v_ing_proy',
    '''etiqueta'',''Ingresos proyectados'',''formato'',''dinero'',''valor'',v_ing_proy,
      ''nota'',''hasta el mes en curso''');

  if v_nuevo = v_src then raise exception 'no se encontró qué reemplazar en ci_resumen'; end if;
  execute v_nuevo;
end $$;
