-- ===========================================================
-- 0101 · CAPITAL INTELLIGENCE — auditoría
-- -----------------------------------------------------------
-- Quién, qué, valor anterior, valor nuevo, cuándo, organización,
-- proyecto y origen. Un trigger genérico sobre las tablas del
-- módulo, escribiendo en `audit_logs`, que ya existe y ya es
-- inmutable por diseño (no tiene política de UPDATE ni de DELETE).
--
-- Dos decisiones que valen la pena explicar:
--
-- 1 · En un UPDATE se guardan SOLO las columnas que cambiaron. La
--     fila entera en cada cambio convierte el historial en ruido:
--     con veinte columnas, encontrar cuál se tocó exige comparar a
--     ojo dos objetos casi idénticos.
--
-- 2 · `ci_model_periods` NO se audita fila por fila. Regenerar la
--     matriz de un modelo escribe cientos de celdas de una vez, y
--     auditar cada una inundaría el registro escondiendo lo que sí
--     importa. Lo que se audita ahí es el modelo y sus líneas —de
--     dónde salen esas celdas— y la versión, que es inmutable.
--
-- El `origen` sale de `request.method`, que PostgREST deja puesto:
-- así se distingue un cambio hecho desde la aplicación de uno hecho
-- por SQL directo. No es un campo decorativo: en un expediente de
-- inversión, "quién lo cambió y por dónde" es media respuesta.
--
-- Ojo con el borrado lógico (0096): un DELETE se convierte en un
-- UPDATE de `deleted_at`, así que en el registro aparece como
-- update. Es correcto —la fila sigue ahí— y queda dicho aquí para
-- que nadie busque un delete que nunca ocurrió.
-- ===========================================================

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

do $$
declare t text;
begin
  foreach t in array array['ci_portfolios','ci_projects','ci_business_units',
                           'ci_project_members','ci_milestones','ci_scenarios',
                           'ci_models','ci_model_lines','ci_actuals',
                           'ci_exchange_rates','ci_thresholds'] loop
    execute format('drop trigger if exists %I on public.%I', t||'_auditar', t);
    execute format('create trigger %I after insert or update or delete on public.%I
                    for each row execute function public.ci_auditar()', t||'_auditar', t);
  end loop;
end $$;

create or replace function public.ci_auditoria(
  p_company uuid, p_entity text default null, p_entity_id text default null,
  p_project uuid default null, p_limite int default 100)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(x order by (x->>'cuando') desc), '[]'::jsonb) from (
    select jsonb_build_object(
             'cuando', a.created_at, 'accion', a.action,
             'entidad', a.entity, 'entidad_id', a.entity_id,
             'quien', coalesce(pf.full_name, pf.email, '—'),
             'origen', a.metadata->>'origen',
             'cambios', a.metadata->'cambios',
             'antes', a.metadata->'antes', 'despues', a.metadata->'despues') x
      from public.audit_logs a
      left join public.profiles pf on pf.id = a.user_id
     where a.company_id = p_company
       and public.has_company_level(p_company, 60)
       and a.entity like 'ci\_%'
       and (p_entity    is null or a.entity = p_entity)
       and (p_entity_id is null or a.entity_id = p_entity_id)
       and (p_project   is null or (a.metadata->>'proyecto')::uuid = p_project)
     order by a.created_at desc
     limit least(coalesce(p_limite, 100), 500)) t;
$$;
revoke execute on function public.ci_auditoria(uuid,text,text,uuid,int) from public, anon;
grant  execute on function public.ci_auditoria(uuid,text,text,uuid,int) to authenticated;

comment on function public.ci_auditar() is
  'Auditoría de Capital Intelligence: quién, qué, valor anterior y nuevo, cuándo, organización, proyecto y origen. En UPDATE guarda solo las columnas que cambiaron.';
comment on function public.ci_auditoria(uuid,text,text,uuid,int) is
  'Lee la auditoría de Capital Intelligence. Exige nivel 60: el historial de cambios de una ronda no es para cualquiera.';
