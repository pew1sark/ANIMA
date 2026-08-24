-- ===========================================================
-- 0051 · Orden de disparadores BEFORE
-- Los triggers BEFORE corren en orden alfabético: 'orders_code' se ejecutaba
-- antes que 'orders_set_company' y generaba el código cuando company_id
-- todavía era nulo. En vez de depender del nombre, el generador de código
-- resuelve la empresa él mismo si hace falta.
-- ===========================================================
create or replace function public.set_code_from_company()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.company_id is null then
    new.company_id := public.current_company();
  end if;
  if new.code is null and new.company_id is not null then
    new.code := public.next_code(new.company_id, TG_ARGV[0]);
  end if;
  return new;
end $$;
revoke execute on function public.set_code_from_company() from public, anon, authenticated;
