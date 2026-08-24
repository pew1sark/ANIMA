-- ===========================================================
-- 0052 · La empresa activa manda al insertar
-- Los disparadores de relleno usaban "la pertenencia más antigua" y se
-- saltaban la empresa activa de la sesión. Para un usuario que pertenece a
-- dos empresas, eso escribía la fila en la empresa equivocada: no rompía el
-- aislamiento, pero corrompía el dato. Detectado en pruebas: un pedido de
-- Bilagay quedó registrado en ANIMA.
--
-- Ahora todos usan current_company(), que respeta app.company_id cuando el
-- frontend la fija:  select set_config('app.company_id', '<uuid>', false)
-- ===========================================================
create or replace function public.set_company_current()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.company_id is null then new.company_id := public.current_company(); end if;
  return new;
end $$;

create or replace function public.set_code_from_company()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.company_id is null then new.company_id := public.current_company(); end if;
  if new.code is null and new.company_id is not null then
    new.code := public.next_code(new.company_id, TG_ARGV[0]);
  end if;
  return new;
end $$;

revoke execute on function public.set_company_current()   from public, anon, authenticated;
revoke execute on function public.set_code_from_company() from public, anon, authenticated;

-- Lo mismo para el Taller de ANIMA (migración 0043)
create or replace function public.set_company_from_alma()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.company_id is null then
    new.company_id := nullif(current_setting('app.company_id', true), '')::uuid;
  end if;
  if new.company_id is null and new.alma_id is not null then
    select cm.company_id into new.company_id
    from public.almas a
    join public.company_members cm on cm.user_id = a.user_id and cm.status = 'active'
    where a.id = new.alma_id
    order by cm.created_at asc limit 1;
  end if;
  return new;
end $$;
revoke execute on function public.set_company_from_alma() from public, anon, authenticated;
