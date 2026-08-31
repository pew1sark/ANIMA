-- 0065 · Estado inicial automatico
-- La 0064 relleno los registros existentes pero no los nuevos: un pedido
-- recien creado nacia con workflow_state nulo, y entonces workflow_advance
-- tenia que adivinar el punto de partida en cada llamada. Detectado en
-- pruebas. Ahora el disparador lo fija al insertar.
create or replace function public.set_initial_workflow_state()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_state text;
begin
  if new.workflow_state is null and new.company_id is not null then
    select s.key into v_state
    from public.workflows w
    join public.workflow_states s on s.workflow_id = w.id and s.is_initial
    where w.company_id = new.company_id and w.entity = tg_table_name and w.active
    order by w.is_default desc, w.created_at
    limit 1;
    new.workflow_state := v_state;
  end if;
  return new;
end $$;
revoke execute on function public.set_initial_workflow_state() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['orders','purchases','deliveries','processing_orders','projects'] loop
    if to_regclass('public.'||t) is not null then
      execute format('drop trigger if exists %I on public.%I', t||'_wf_initial', t);
      -- 'z_' al final del nombre para que corra DESPUES del que asigna la empresa
      execute format('create trigger %I before insert on public.%I
                      for each row execute function public.set_initial_workflow_state()',
                      'z_'||t||'_wf_initial', t);
      execute format('drop trigger if exists %I on public.%I', 'z_'||t||'_wf_initial_old', t);
    end if;
  end loop;
end $$;