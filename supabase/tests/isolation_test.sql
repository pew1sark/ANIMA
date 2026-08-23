-- ===========================================================
-- PRUEBA DE AISLAMIENTO MULTIEMPRESA
-- Crea dos usuarios y dos empresas de prueba, comprueba que
-- ninguna ve nada de la otra, y BORRA TODO al terminar (incluso
-- si una comprobación falla).
--
-- Ejecutar con el MCP de Supabase (execute_sql) y, al terminar:
--   drop function if exists public.__isolation_test();
-- Dejarla viva sería un agujero: inserta en auth.users.
--
-- Repetir tras CADA migración que toque políticas RLS.
-- ===========================================================
create or replace function public.__isolation_test()
returns table(n int, prueba text, resultado text, detalle text)
language plpgsql as $fn$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  ca uuid; cb uuid; sa uuid; c int; k int;
begin
  select id into sa from auth.users where email='sarkgraff@gmail.com';
  insert into auth.users (id,instance_id,aud,role,email,raw_user_meta_data,created_at,updated_at)
  values (ua,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','iso-a@test.local','{"name":"ISO A"}',now(),now()),
         (ub,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','iso-b@test.local','{"name":"ISO B"}',now(),now());
  insert into public.companies (name,slug,created_by) values ('ISO A','iso-empresa-a',ua) returning id into ca;
  insert into public.companies (name,slug,created_by) values ('ISO B','iso-empresa-b',ub) returning id into cb;
  insert into public.audit_logs (company_id,user_id,action) values (ca,ua,'iso.a'),(cb,ub,'iso.b');

  -- ---------- USUARIO A ----------
  perform set_config('request.jwt.claims', json_build_object('sub',ua::text,'role','authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into c from public.companies;
  n:=1; prueba:='A ve unicamente su empresa'; resultado:=case when c=1 then 'OK' else 'FALLA' end;
  detalle:=c||' empresa(s) visible(s); esperado 1'; return next;

  select count(*) into c from public.companies where id=cb;
  n:=2; prueba:='A NO ve la empresa de B'; resultado:=case when c=0 then 'OK' else 'FALLA' end;
  detalle:='filas leidas de la empresa B: '||c; return next;

  select count(*) into c from public.audit_logs where company_id=cb;
  n:=3; prueba:='A NO lee la auditoria de B'; resultado:=case when c=0 then 'OK' else 'FALLA' end;
  detalle:='registros de B visibles: '||c; return next;

  select count(*) into c from public.company_members where company_id=cb;
  n:=4; prueba:='A NO ve los miembros de B'; resultado:=case when c=0 then 'OK' else 'FALLA' end;
  detalle:='miembros de B visibles: '||c; return next;

  begin
    insert into public.audit_logs (company_id,user_id,action) values (cb,ua,'intrusion');
    n:=5; prueba:='A NO puede escribir en la empresa B'; resultado:='FALLA';
    detalle:='el INSERT fue aceptado'; return next;
  exception when insufficient_privilege or check_violation then
    n:=5; prueba:='A NO puede escribir en la empresa B'; resultado:='OK';
    detalle:='Postgres rechazo el INSERT (RLS)'; return next;
  end;

  update public.companies set name='hackeada' where id=cb;
  get diagnostics k = row_count;
  n:=6; prueba:='A NO puede modificar la empresa B'; resultado:=case when k=0 then 'OK' else 'FALLA' end;
  detalle:='filas modificadas: '||k; return next;

  delete from public.companies where id=cb;
  get diagnostics k = row_count;
  n:=7; prueba:='A NO puede borrar la empresa B'; resultado:=case when k=0 then 'OK' else 'FALLA' end;
  detalle:='filas borradas: '||k; return next;

  -- ---------- USUARIO B ----------
  perform set_config('request.jwt.claims', json_build_object('sub',ub::text,'role','authenticated')::text, true);
  select count(*) into c from public.companies;
  n:=8; prueba:='B ve unicamente su empresa'; resultado:=case when c=1 then 'OK' else 'FALLA' end;
  detalle:=c||' empresa(s) visible(s); esperado 1'; return next;

  select count(*) into c from public.companies where id=ca;
  n:=9; prueba:='B NO ve la empresa de A'; resultado:=case when c=0 then 'OK' else 'FALLA' end;
  detalle:='filas leidas de la empresa A: '||c; return next;

  -- ---------- SUPER ADMIN ----------
  perform set_config('request.jwt.claims', json_build_object('sub',sa::text,'role','authenticated')::text, true);
  select count(*) into c from public.companies where id in (ca,cb);
  n:=10; prueba:='El Super Admin ve ambas empresas'; resultado:=case when c=2 then 'OK' else 'FALLA' end;
  detalle:=c||' de 2 visibles'; return next;

  -- ---------- SIN SESION ----------
  execute 'reset role';
  execute 'set local role anon';
  perform set_config('request.jwt.claims','', true);
  select count(*) into c from public.companies;
  n:=11; prueba:='Sin sesion no se ve ninguna empresa'; resultado:=case when c=0 then 'OK' else 'FALLA' end;
  detalle:='empresas visibles para anon: '||c; return next;

  begin
    perform public.is_platform_admin();
    n:=12; prueba:='anon NO puede llamar is_platform_admin()'; resultado:='FALLA';
    detalle:='la funcion se ejecuto sin sesion'; return next;
  exception when insufficient_privilege then
    n:=12; prueba:='anon NO puede llamar is_platform_admin()'; resultado:='OK';
    detalle:='EXECUTE denegado al rol anon'; return next;
  end;

  -- ---------- LIMPIEZA ----------
  execute 'reset role';
  delete from public.companies where id in (ca,cb);
  delete from auth.users where id in (ua,ub);
  n:=13; prueba:='Limpieza de datos de prueba'; resultado:='OK';
  detalle:='empresas y usuarios de prueba eliminados'; return next;
exception when others then
  execute 'reset role';
  delete from public.companies where slug in ('iso-empresa-a','iso-empresa-b');
  delete from auth.users where email in ('iso-a@test.local','iso-b@test.local');
  n:=99; prueba:='ERROR EN LA PRUEBA'; resultado:='FALLA'; detalle:=sqlerrm; return next;
end $fn$;

select n as "#", prueba, resultado, detalle from public.__isolation_test() order by n;
