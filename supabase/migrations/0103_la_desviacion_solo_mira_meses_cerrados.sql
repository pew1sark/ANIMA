-- 0103 · La desviación presupuestaria solo mira meses cerrados,
--        y un inversionista de demostración para probar el permiso
--        por proyecto.
--
-- EL PROBLEMA. El panel comparaba el presupuesto de la ventana
-- entera —doce meses hacia atrás y doce hacia adelante— contra la
-- ejecución real, que por definición solo existe hasta hoy.
-- Resultado: −86,6% de desviación en una cartera que va bien. La
-- cifra era correcta y la pregunta que respondía no era la que
-- alguien lee en un tablero.
--
-- Desviación presupuestaria significa "de lo que ya debió pasar,
-- cuánto se separó de lo previsto". Los meses que aún no ocurren
-- no se ejecutaron mal: no se ejecutaron.
--
-- Se corrige sobre la definición viva en vez de volver a pegar 130
-- líneas: el cambio son dos filtros y así queda escrito cuáles.
do $$
declare v_src text; v_nuevo text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ci_resumen';
  if v_src is null then raise exception 'ci_resumen no existe'; end if;

  v_nuevo := replace(v_src,
    'filter (where a.kind <> ''inversion''), 0)
    into v_ing_real, v_ebitda, v_real',
    'filter (where a.kind <> ''inversion''
                              and a.period <= date_trunc(''month'', current_date)::date), 0)
    into v_ing_real, v_ebitda, v_real');

  v_nuevo := replace(v_nuevo,
    'filter (where ml.kind <> ''inversion''), 0)
    into v_ing_proy, v_presu',
    'filter (where ml.kind <> ''inversion''
                              and mp.period <= date_trunc(''month'', current_date)::date), 0)
    into v_ing_proy, v_presu');

  if v_nuevo = v_src then raise exception 'no se encontró qué reemplazar en ci_resumen'; end if;
  execute v_nuevo;
end $$;

-- Un inversionista invitado a UN proyecto. Existe para que el
-- permiso por proyecto se pueda comprobar entrando, no leyendo el
-- código: esta cuenta ve la membresía y no ve nada más de la firma.
do $$
declare v_emp uuid; v_user uuid; v_rol uuid; v_pa uuid;
begin
  select id into v_emp  from public.companies where slug = 'demo-capital-intelligence';
  select id into v_user from public.profiles  where email = 'animatsc@gmail.com';
  select id into v_rol  from public.roles     where slug = 'viewer';
  if v_emp is null or v_user is null then raise notice 'sin demo o sin cuenta'; return; end if;

  select id into v_pa from public.ci_projects
   where company_id = v_emp and name = '[DEMO] Club de membresía';

  insert into public.company_members (company_id, user_id, role_id, status)
  values (v_emp, v_user, v_rol, 'active')
  on conflict (company_id, user_id) do update set role_id = excluded.role_id, status = 'active';

  insert into public.ci_project_members (company_id, project_id, user_id, access)
  values (v_emp, v_pa, v_user, 'lector')
  on conflict (project_id, user_id) do update set access = 'lector';
end $$;
