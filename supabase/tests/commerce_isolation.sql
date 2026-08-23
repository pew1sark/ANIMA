-- ===========================================================
-- PRUEBA DE AISLAMIENTO · MÓDULO COMMERCE
-- Comprueba lo que distingue a una base multiempresa de una
-- de un solo cliente: que dos empresas puedan usar el MISMO
-- código sin pisarse, y que no se vean entre ellas.
--
-- Crea dos empresas de prueba y las borra al terminar.
-- Al acabar:  drop function if exists public.__commerce_isolation();
-- Última ejecución: 23-08-2026 · 8 de 8 correctas.
-- ===========================================================
create or replace function public.__commerce_isolation()
returns table(n int, prueba text, resultado text, detalle text)
language plpgsql as $fn$
declare ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
        ca uuid; cb uuid; pa uuid; pb uuid; c int; cod text; cod2 text;
begin
  insert into auth.users (id,instance_id,aud,role,email,raw_user_meta_data,created_at,updated_at)
  values (ua,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','com-a@test.local','{"name":"COM A"}',now(),now()),
         (ub,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','com-b@test.local','{"name":"COM B"}',now(),now());
  insert into public.companies (name,slug,created_by) values ('COM A','com-empresa-a',ua) returning id into ca;
  insert into public.companies (name,slug,created_by) values ('COM B','com-empresa-b',ub) returning id into cb;

  perform set_config('request.jwt.claims', json_build_object('sub',ua::text,'role','authenticated')::text, true);
  execute 'set local role authenticated';

  insert into public.products (company_id, sku, name) values (ca,'SKU-001','Merluza A') returning id into pa;
  n:=1; prueba:='Empresa A crea un producto SKU-001'; resultado:='OK'; detalle:='creado'; return next;

  insert into public.suppliers (company_id, name, code) values (ca,'Caleta A','PROV-01');
  insert into public.purchases (company_id, supplier_id)
    select ca, id from public.suppliers where company_id=ca limit 1 returning code into cod;
  n:=2; prueba:='El codigo de compra se genera por empresa';
  resultado:=case when cod like 'COM-%-000001' then 'OK' else 'FALLA' end; detalle:=coalesce(cod,'(nulo)'); return next;

  perform set_config('request.jwt.claims', json_build_object('sub',ub::text,'role','authenticated')::text, true);

  select count(*) into c from public.products;
  n:=3; prueba:='Empresa B NO ve los productos de A';
  resultado:=case when c=0 then 'OK' else 'FALLA' end; detalle:=c||' visibles; esperado 0'; return next;

  select count(*) into c from public.purchase_history;
  n:=4; prueba:='Empresa B NO ve el registro tributario de A';
  resultado:=case when c=0 then 'OK' else 'FALLA' end; detalle:=c||' visibles; esperado 0'; return next;

  begin
    insert into public.products (company_id, sku, name) values (cb,'SKU-001','Merluza B') returning id into pb;
    n:=5; prueba:='Empresa B puede reutilizar el MISMO SKU-001'; resultado:='OK';
    detalle:='el unico es por empresa, no global'; return next;
  exception when unique_violation then
    n:=5; prueba:='Empresa B puede reutilizar el MISMO SKU-001'; resultado:='FALLA';
    detalle:='indice unico global: bloquearia al segundo cliente'; return next;
  end;

  insert into public.suppliers (company_id, name, code) values (cb,'Caleta B','PROV-01');
  insert into public.purchases (company_id, supplier_id)
    select cb, id from public.suppliers where company_id=cb limit 1 returning code into cod2;
  n:=6; prueba:='La numeracion de B arranca en 1, no continua la de A';
  resultado:=case when cod2 like 'COM-%-000001' then 'OK' else 'FALLA' end;
  detalle:='A: '||coalesce(cod,'?')||'  ·  B: '||coalesce(cod2,'?'); return next;

  begin
    insert into public.products (company_id, sku, name) values (ca,'SKU-999','Intruso');
    n:=7; prueba:='Empresa B NO puede escribir en la empresa A'; resultado:='FALLA';
    detalle:='el INSERT fue aceptado'; return next;
  exception when insufficient_privilege or check_violation then
    n:=7; prueba:='Empresa B NO puede escribir en la empresa A'; resultado:='OK';
    detalle:='Postgres rechazo el INSERT (RLS)'; return next;
  end;

  execute 'reset role';
  delete from public.companies where id in (ca,cb);
  delete from auth.users where id in (ua,ub);
  n:=8; prueba:='Limpieza'; resultado:='OK'; detalle:='datos de prueba eliminados'; return next;
exception when others then
  execute 'reset role';
  delete from public.companies where slug in ('com-empresa-a','com-empresa-b');
  delete from auth.users where email in ('com-a@test.local','com-b@test.local');
  n:=99; prueba:='ERROR'; resultado:='FALLA'; detalle:=sqlerrm; return next;
end $fn$;

select n as "#", prueba, resultado, detalle from public.__commerce_isolation() order by n;
