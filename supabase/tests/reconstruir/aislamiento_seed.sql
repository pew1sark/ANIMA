-- Después de seed.sql: cada usuario de prueba ve lo suyo y nada más.
-- Falla (raise) en la primera comprobación que no se cumpla.
create or replace function pg_temp.ve(p_user text, p_tabla text) returns bigint
language plpgsql as $$
declare n bigint;
begin
  if p_user is null then
    set local role anon;
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  else
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  end if;
  execute format('select count(*) from public.%I', p_tabla) into n;
  reset role;
  return n;
end $$;

do $$
declare
  vendedor constant text := '5eed0000-0000-4000-8000-000000000003';
  andres   constant text := '5eed0000-0000-4000-8000-000000000002';
  r record;
begin
  for r in select * from (values
    (vendedor, 'orders', 2), (vendedor, 'customers', 3),
    (vendedor, 'rei_properties', 0), (vendedor, 'rei_leads', 0), (vendedor, 'companies', 1),
    (andres, 'orders', 0), (andres, 'customers', 0),
    (andres, 'rei_properties', 3), (andres, 'rei_leads', 2), (andres, 'companies', 1),
    (null, 'orders', 0), (null, 'customers', 0), (null, 'rei_properties', 0),
    (null, 'companies', 0), (null, 'company_members', 0)
  ) as t(usuario, tabla, esperado)
  loop
    if pg_temp.ve(r.usuario, r.tabla) <> r.esperado then
      raise exception 'Aislamiento roto: % ve % filas de % (esperado %)',
        coalesce(r.usuario, 'anon'), pg_temp.ve(r.usuario, r.tabla), r.tabla, r.esperado;
    end if;
  end loop;
  raise notice 'Aislamiento del seed: 15 de 15 comprobaciones correctas';
end $$;
