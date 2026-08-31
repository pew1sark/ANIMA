-- 0073 · El Super Admin administra el software, no opera la empresa del cliente.
--
-- EL PROBLEMA
-- has_company_level() estaba definida asi:
--     is_platform_admin() OR company_role_level(empresa) >= nivel
-- Es decir: el Super Admin pasaba TODA politica que la usara. Y la usan las 39
-- tablas de negocio. Resultado: quitarle la membresia a alguien no le quitaba
-- nada, porque seguia entrando por ahi. La puerta no se veia revisando el texto
-- de las politicas, porque el permiso entraba de forma indirecta.
--
-- LA CORRECCION
-- 1. has_company_level pasa a significar solo lo que su nombre dice: que nivel
--    tiene esta persona EN esta empresa. Sin excepciones.
-- 2. Las tablas de CONFIGURACION reciben la via del Super Admin de forma
--    explicita, porque implementar a un cliente exige configurarle modulos,
--    campos y flujos. Se agrega envolviendo la logica que ya tenian, para no
--    reescribirla y no cambiar nada mas.
-- 3. Las 39 tablas de NEGOCIO quedan cerradas: productos, clientes, pedidos,
--    facturas, compras, inventario, pagos, proyectos, cotizaciones.
--
-- Efecto buscado: SARK ve de Bilagay la relacion comercial —plan, suscripcion,
-- cobros, modulos— y deja de ver sus ventas. Que es lo correcto: no es el dueno.

-- ---------- 1 · La funcion deja de tener puerta trasera ----------
create or replace function public.has_company_level(p_company uuid, p_min integer)
returns boolean language sql stable security definer set search_path = public, pg_temp as $fn$
  select public.company_role_level(p_company) >= p_min;
$fn$;

comment on function public.has_company_level(uuid, integer) is
  'Nivel de la persona EN esa empresa. NO concede nada por ser platform_admin: para eso esta is_platform_admin(), que se pone explicita donde corresponda.';

-- ---------- 2 · Las tablas de configuracion recuperan al Super Admin ----------
do $$
declare r record; v_using text; v_check text; v_sql text;
begin
  for r in
    select tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and tablename in ('companies','company_config','company_members','company_modules',
                         'company_role_permissions','counters','custom_fields','intake_rows',
                         'survey_answers','survey_sessions','user_invitations',
                         'workflows','workflow_states','workflow_transitions')
       and (coalesce(qual,'') || ' ' || coalesce(with_check,'')) like '%has_company_level%'
       and (coalesce(qual,'') || ' ' || coalesce(with_check,'')) not like '%is_platform_admin%'
  loop
    v_using := case when r.qual       is null then null
                    else '(' || r.qual || ') or public.is_platform_admin()' end;
    v_check := case when r.with_check is null then null
                    else '(' || r.with_check || ') or public.is_platform_admin()' end;

    v_sql := format('alter policy %I on public.%I', r.policyname, r.tablename);
    if v_using is not null then v_sql := v_sql || format(' using (%s)', v_using); end if;
    if v_check is not null then v_sql := v_sql || format(' with check (%s)', v_check); end if;

    execute v_sql;
    raise notice 'via explicita agregada: %.%', r.tablename, r.policyname;
  end loop;
end $$;

-- ---------- 3 · Las funciones de implementacion ----------
-- survey_apply e import_intake son parte de poner en marcha a un cliente: las
-- ejecuta la plataforma, no un empleado del cliente. Necesitan la via explicita.
create or replace function public.assert_company(p_company uuid, p_level int)
returns void language plpgsql stable security definer set search_path = public, pg_temp as $fn$
begin
  if p_company is null then raise exception 'Registro sin empresa'; end if;
  if not (public.has_company_level(p_company, p_level) or public.is_platform_admin()) then
    raise exception 'Sin acceso a los datos de esa empresa';
  end if;
end $fn$;

comment on function public.assert_company(uuid, int) is
  'Guarda de las funciones de negocio. Admite al platform_admin porque estas funciones tambien se usan para implementar; el acceso de LECTURA a los datos lo sigue decidiendo el RLS de cada tabla, que ya no lo admite.';
