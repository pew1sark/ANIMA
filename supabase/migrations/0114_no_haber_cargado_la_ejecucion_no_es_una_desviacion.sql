-- 0114 · No haber cargado la ejecución no es una desviación del 100%.
--
-- Una organización recién creada tiene presupuesto para los meses ya
-- cerrados y cero movimientos reales. La resta daba −100% y el panel
-- abría con una alerta roja de «desviación crítica» el primer día,
-- antes de que nadie hubiera hecho nada mal.
--
-- Es el peor tipo de falso positivo: el que sale en la pantalla que se
-- usa para decidir. Y enseña a ignorar las alertas, que es justo lo que
-- una alerta no puede permitirse.
--
-- «No sé» y «vas mal» son respuestas distintas. Sin un solo movimiento
-- cargado, la desviación no es cero ni es −100: no existe. La tarjeta
-- queda vacía —con su «todavía no hay ejecución cargada»— y la alerta
-- pasa a decir lo que de verdad ocurre: falta cargar lo que pasó.
--
-- Se corrige sobre la definición viva porque el cambio son seis puntos
-- concretos de `ci_resumen()` y así queda escrito cuáles.
do $$
declare v_src text; v_n text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ci_resumen';
  if v_src is null then raise exception 'ci_resumen no existe'; end if;
  v_n := v_src;

  v_n := replace(v_n,
    'v_warn numeric; v_crit numeric; v_desv numeric;',
    'v_warn numeric; v_crit numeric; v_desv numeric; v_movimientos int;');

  v_n := replace(v_n,
    'filter (where a.kind <> ''inversion''
                              and a.period <= date_trunc(''month'', current_date)::date), 0)
    into v_ing_real, v_ebitda, v_real',
    'filter (where a.kind <> ''inversion''
                              and a.period <= date_trunc(''month'', current_date)::date), 0),
         count(*)
    into v_ing_real, v_ebitda, v_real, v_movimientos');

  v_n := replace(v_n,
    'v_desv := case when v_presu <> 0 then round((v_real - v_presu) / abs(v_presu) * 100, 1) end;',
    'v_desv := case when coalesce(v_movimientos, 0) = 0 then null
                  when v_presu <> 0 then round((v_real - v_presu) / abs(v_presu) * 100, 1) end;');

  v_n := replace(v_n,
    '''desviacion'',''Desviación presupuestaria'', coalesce(v_desv, 0),''porcentaje''',
    '''desviacion'',''Desviación presupuestaria'', v_desv,''porcentaje''');

  v_n := replace(v_n,
    '|| jsonb_build_object(''nota'',''real contra presupuesto vigente'',
           ''tono'', case when abs(coalesce(v_desv,0)) >= v_crit then ''malo''
                        when abs(coalesce(v_desv,0)) >= v_warn then ''aviso'' else ''ok'' end)',
    '|| jsonb_build_object(
           ''nota'', case when coalesce(v_movimientos,0) = 0 then ''todavía no hay ejecución cargada''
                        else ''real contra presupuesto vigente'' end,
           ''tono'', case when v_desv is null then null
                        when abs(v_desv) >= v_crit then ''malo''
                        when abs(v_desv) >= v_warn then ''aviso'' else ''ok'' end)');

  v_n := replace(v_n,
    'if v_desv is not null and abs(v_desv) >= v_crit then',
    'if coalesce(v_movimientos,0) = 0 and v_presu > 0 then
    v_alertas := v_alertas || public.ci_aviso(''sin_ejecucion'',''aviso'',
      ''Todavía no hay ejecución real cargada'',
      ''Hay presupuesto para meses que ya cerraron y ningún movimiento contra el cual compararlo. No es una desviación: es que falta cargar lo que pasó.'');
  end if;
  if v_desv is not null and abs(v_desv) >= v_crit then');

  if v_n = v_src then raise exception 'ningún reemplazo encontró su sitio en ci_resumen'; end if;
  execute v_n;
end $$;
