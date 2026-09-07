-- ===========================================================
-- 0109 · Borrar una organización no puede chocar con su propia auditoría
-- -----------------------------------------------------------
-- EL PROBLEMA, encontrado al intentar dar de baja la organización de
-- demostración:
--
--   ERROR 23503: insert on "audit_logs" violates foreign key
--   "audit_logs_company_id_fkey" — Key (company_id)=(…) is not present
--   in table "companies".
--
-- La cadena era esta. Se borra una empresa; la cascada llega a
-- `ci_portfolios`; ahí el trigger de BORRADO LÓGICO (0096) convierte el
-- DELETE en un UPDATE de `deleted_at`; ese UPDATE dispara el trigger de
-- AUDITORÍA (0101); y la auditoría intenta escribir una fila que apunta
-- a una empresa que en ese momento ya no existe.
--
-- Los dos triggers hacían lo correcto por separado y juntos hacían
-- imposible lo único que faltaba: dar de baja a un cliente. Y no es un
-- caso de laboratorio — es lo que pasa cuando alguien se va.
--
-- LA REGLA QUE FALTABA, dicha una vez: cuando la empresa dueña ya no
-- está, no hay nada que conservar ni a quién auditar.
--
--   · el borrado lógico deja pasar el DELETE de verdad. Marcar
--     `deleted_at` en una fila cuya empresa ya no existe deja basura
--     inalcanzable, no un archivo histórico.
--   · la auditoría se calla. El registro de auditoría de una empresa se
--     va con la empresa, que es justo lo que el `on delete cascade` de
--     `audit_logs` ya decía.
--
-- Se detecta preguntando si la empresa sigue ahí: durante la cascada la
-- fila padre ya se borró, así que la respuesta distingue sin ambigüedad
-- «me están borrando a mí» de «me borran con mi empresa».
-- ===========================================================

create or replace function public.ci_borrado_logico()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  /* La empresa dueña se está borrando: la fila se va de verdad. */
  if not exists (select 1 from public.companies where id = old.company_id) then
    return old;
  end if;

  execute format('update public.%I set deleted_at = now() where id = $1 and deleted_at is null', tg_table_name)
    using old.id;
  return null;   -- null cancela el DELETE físico
end $$;
revoke execute on function public.ci_borrado_logico() from public, anon, authenticated;

create or replace function public.ci_auditar()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_antes jsonb; v_despues jsonb; v_cambios jsonb;
  v_company uuid; v_proyecto uuid; v_id text;
begin
  if tg_op = 'INSERT' then v_antes := null;            v_despues := to_jsonb(new);
  elsif tg_op = 'DELETE' then v_antes := to_jsonb(old); v_despues := null;
  else                        v_antes := to_jsonb(old); v_despues := to_jsonb(new);
  end if;

  v_company  := coalesce((v_despues->>'company_id')::uuid, (v_antes->>'company_id')::uuid);

  /* Sin empresa a la que colgar la línea, no hay auditoría que escribir.
     Pasa cuando la organización entera se está dando de baja. */
  if v_company is null
     or not exists (select 1 from public.companies where id = v_company) then
    return null;
  end if;

  v_id       := coalesce(v_despues->>'id', v_antes->>'id');
  v_proyecto := coalesce((v_despues->>'project_id')::uuid, (v_antes->>'project_id')::uuid,
                         case when tg_table_name = 'ci_projects' then v_id::uuid end);

  if tg_op = 'UPDATE' then
    select jsonb_object_agg(k, jsonb_build_object('antes', v_antes->k, 'despues', v_despues->k))
      into v_cambios
      from jsonb_object_keys(v_despues) k
     where v_despues->k is distinct from v_antes->k
       and k <> 'updated_at';
    if v_cambios is null then return null; end if;
  end if;

  insert into public.audit_logs (company_id, user_id, action, entity, entity_id, metadata)
  values (v_company, (select auth.uid()),
          lower(tg_op) || '_' || tg_table_name,
          tg_table_name, v_id,
          jsonb_strip_nulls(jsonb_build_object(
            'proyecto', v_proyecto,
            'cambios',  v_cambios,
            'antes',    case when tg_op = 'DELETE' then v_antes   end,
            'despues',  case when tg_op = 'INSERT' then v_despues end,
            'origen',   coalesce(current_setting('request.method', true), 'sql'))));
  return null;
end $$;
revoke execute on function public.ci_auditar() from public, anon, authenticated;
