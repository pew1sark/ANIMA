-- 0064 · WORKFLOWS CONFIGURABLES
-- Los estados vivian en enums de PostgreSQL: cambiarlos exigia una migracion
-- que afectaba a TODOS los tenants a la vez. Un cliente no podia tener
-- cotizacion → aprobacion → produccion → control de calidad → despacho.
--
-- Decision: CONVIVENCIA, no migracion de golpe. Se agrega workflow_state
-- (texto) junto al status (enum). Las funciones que hoy operan con Bilagay
-- siguen intactas; los flujos nuevos se definen por empresa y por entidad.
-- Cuando todas las pantallas lean workflow_state, el enum se retira.

create table if not exists public.workflows (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  entity text not null,                    -- 'orders', 'purchases', 'projects'…
  slug   text not null,
  name   text not null,
  description text,
  is_default boolean not null default false,
  active boolean not null default true,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  unique (company_id, entity, slug)
);
comment on table public.workflows is 'Un flujo por empresa y entidad. Reemplaza a los enum de estado.';

create table if not exists public.workflow_states (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  key   text not null,
  label text not null,
  color text,
  sort  int  not null default 100,
  is_initial boolean not null default false,
  is_final   boolean not null default false,
  is_cancel  boolean not null default false,
  unique (workflow_id, key)
);

create table if not exists public.workflow_transitions (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  from_state text not null,
  to_state   text not null,
  label text,
  min_level int not null default 40,       -- nivel de rol necesario
  requires_permission text,                -- opcional: recurso.accion
  unique (workflow_id, from_state, to_state)
);

create index if not exists workflows_company_idx    on public.workflows(company_id, entity) where active;
create index if not exists wf_states_workflow_idx   on public.workflow_states(workflow_id);
create index if not exists wf_trans_workflow_idx    on public.workflow_transitions(workflow_id, from_state);

-- Columna paralela al enum, para convivir sin romper nada
do $$
declare t text;
begin
  foreach t in array array['orders','purchases','deliveries','processing_orders','projects'] loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table public.%I add column if not exists workflow_state text', t);
      execute format('create index if not exists %I on public.%I(company_id, workflow_state)',
                     t||'_wf_state_idx', t);
    end if;
  end loop;
end $$;

-- ---------- RLS ----------
alter table public.workflows            enable row level security;
alter table public.workflow_states      enable row level security;
alter table public.workflow_transitions enable row level security;

drop policy if exists workflows_read on public.workflows;
create policy workflows_read on public.workflows for select to authenticated
  using (public.is_company_member(company_id) or public.is_platform_admin());
drop policy if exists workflows_write on public.workflows;
create policy workflows_write on public.workflows for all to authenticated
  using (public.has_company_level(company_id, 80)) with check (public.has_company_level(company_id, 80));

drop policy if exists wf_states_rw on public.workflow_states;
create policy wf_states_rw on public.workflow_states for all to authenticated
  using (exists (select 1 from public.workflows w where w.id = workflow_id
                 and (public.is_company_member(w.company_id) or public.is_platform_admin())))
  with check (exists (select 1 from public.workflows w where w.id = workflow_id
                 and public.has_company_level(w.company_id, 80)));

drop policy if exists wf_trans_rw on public.workflow_transitions;
create policy wf_trans_rw on public.workflow_transitions for all to authenticated
  using (exists (select 1 from public.workflows w where w.id = workflow_id
                 and (public.is_company_member(w.company_id) or public.is_platform_admin())))
  with check (exists (select 1 from public.workflows w where w.id = workflow_id
                 and public.has_company_level(w.company_id, 80)));

-- ---------- Crear un flujo desde una lista de estados ----------
create or replace function public.workflow_create(p_entity text, p_slug text, p_name text,
  p_states jsonb, p_company uuid default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_c uuid; v_wf uuid; e jsonb; i int := 0; v_prev text := null; v_key text;
begin
  v_c := coalesce(p_company, public.current_company());
  perform public.assert_company(v_c, 80);

  insert into public.workflows (company_id, entity, slug, name)
  values (v_c, p_entity, p_slug, p_name)
  on conflict (company_id, entity, slug) do update set name = excluded.name, active = true
  returning id into v_wf;

  delete from public.workflow_states      where workflow_id = v_wf;
  delete from public.workflow_transitions where workflow_id = v_wf;

  for e in select * from jsonb_array_elements(p_states) loop
    i := i + 1;
    v_key := e->>'key';
    insert into public.workflow_states (workflow_id, key, label, color, sort,
           is_initial, is_final, is_cancel)
    values (v_wf, v_key, coalesce(e->>'label', initcap(replace(v_key,'_',' '))),
            e->>'color', i * 10,
            coalesce((e->>'initial')::boolean, i = 1),
            coalesce((e->>'final')::boolean, false),
            coalesce((e->>'cancel')::boolean, false));

    -- Encadena en el orden dado, salvo los estados de cancelacion
    if v_prev is not null and not coalesce((e->>'cancel')::boolean, false) then
      insert into public.workflow_transitions (workflow_id, from_state, to_state, min_level)
      values (v_wf, v_prev, v_key, coalesce((e->>'min_level')::int, 40))
      on conflict do nothing;
    end if;
    if not coalesce((e->>'cancel')::boolean, false) then v_prev := v_key; end if;
  end loop;

  -- Desde cualquier estado no final se puede ir a los de cancelacion
  insert into public.workflow_transitions (workflow_id, from_state, to_state, min_level, label)
  select v_wf, s.key, c.key, 60, 'Cancelar'
  from public.workflow_states s, public.workflow_states c
  where s.workflow_id = v_wf and c.workflow_id = v_wf
    and c.is_cancel and not s.is_cancel and not s.is_final
  on conflict do nothing;

  return v_wf;
end $$;

-- ---------- Avanzar un registro por su flujo ----------
create or replace function public.workflow_advance(p_entity text, p_record uuid, p_to text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_c uuid; v_from text; v_wf uuid; v_tr record; v_final boolean;
begin
  execute format('select company_id, workflow_state from public.%I where id = $1', p_entity)
    into v_c, v_from using p_record;
  if v_c is null then raise exception 'Registro no encontrado'; end if;
  perform public.assert_company(v_c, 40);

  select id into v_wf from public.workflows
   where company_id = v_c and entity = p_entity and active
   order by is_default desc, created_at limit 1;
  if v_wf is null then raise exception 'Esta empresa no tiene un flujo definido para %', p_entity; end if;

  -- Si aun no tiene estado, arranca en el inicial
  if v_from is null then
    select key into v_from from public.workflow_states
     where workflow_id = v_wf and is_initial limit 1;
  end if;

  select * into v_tr from public.workflow_transitions
   where workflow_id = v_wf and from_state = v_from and to_state = p_to;
  if v_tr is null then
    raise exception 'No se puede pasar de "%" a "%" en este flujo', v_from, p_to;
  end if;
  if not public.has_company_level(v_c, v_tr.min_level) then
    raise exception 'Se requiere mas nivel para ese paso';
  end if;
  if v_tr.requires_permission is not null
     and not public.has_perm(split_part(v_tr.requires_permission,'.',1),
                             split_part(v_tr.requires_permission,'.',2)) then
    raise exception 'Sin permiso para ese paso';
  end if;

  execute format('update public.%I set workflow_state = $1 where id = $2', p_entity)
    using p_to, p_record;

  select is_final into v_final from public.workflow_states
   where workflow_id = v_wf and key = p_to;

  insert into public.audit_logs (company_id, user_id, action, entity, entity_id, metadata)
  values (v_c, (select auth.uid()), 'WORKFLOW', p_entity, p_record::text,
          jsonb_build_object('desde', v_from, 'hacia', p_to));

  return jsonb_build_object('ok', true, 'desde', v_from, 'hacia', p_to, 'final', coalesce(v_final,false));
end $$;

-- Que pasos tiene disponibles un registro ahora mismo (para pintar botones)
create or replace function public.workflow_next(p_entity text, p_record uuid)
returns table(to_state text, label text, permitido boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_c uuid; v_from text; v_wf uuid;
begin
  execute format('select company_id, workflow_state from public.%I where id = $1', p_entity)
    into v_c, v_from using p_record;
  if v_c is null or not public.is_company_member(v_c) then return; end if;

  select id into v_wf from public.workflows
   where company_id = v_c and entity = p_entity and active
   order by is_default desc, created_at limit 1;
  if v_wf is null then return; end if;

  if v_from is null then
    select key into v_from from public.workflow_states where workflow_id = v_wf and is_initial limit 1;
  end if;

  return query
    select t.to_state, coalesce(t.label, s.label), public.has_company_level(v_c, t.min_level)
    from public.workflow_transitions t
    join public.workflow_states s on s.workflow_id = t.workflow_id and s.key = t.to_state
    where t.workflow_id = v_wf and t.from_state = v_from
    order by s.sort;
end $$;

do $$
declare f text;
begin
  foreach f in array array['workflow_create(text,text,text,jsonb,uuid)',
    'workflow_advance(text,uuid,text)','workflow_next(text,uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------- Semilla: el flujo actual, tal cual, para cada empresa ----------
-- Nadie nota el cambio: el flujo por defecto es exactamente el enum de hoy.
do $$
declare c record; v_wf uuid;
begin
  for c in select id, slug from public.companies loop
    insert into public.workflows (company_id, entity, slug, name, description, is_default, source)
    values (c.id, 'orders', 'estandar', 'Flujo de pedido estandar',
            'Replica el flujo original. Punto de partida para personalizar.', true, 'semilla')
    on conflict (company_id, entity, slug) do nothing
    returning id into v_wf;

    if v_wf is not null then
      insert into public.workflow_states (workflow_id, key, label, color, sort, is_initial, is_final, is_cancel) values
        (v_wf,'nuevo','Nuevo','#6b665e',10,true,false,false),
        (v_wf,'confirmado','Confirmado','#4a6b8a',20,false,false,false),
        (v_wf,'en_preparacion','En preparación','#a5762a',30,false,false,false),
        (v_wf,'preparado','Preparado','#a8813a',40,false,false,false),
        (v_wf,'en_reparto','En reparto','#3a7a58',50,false,false,false),
        (v_wf,'entregado','Entregado','#3a7a58',60,false,true,false),
        (v_wf,'cancelado','Cancelado','#a63f3f',70,false,true,true);

      insert into public.workflow_transitions (workflow_id, from_state, to_state, min_level) values
        (v_wf,'nuevo','confirmado',40),
        (v_wf,'confirmado','en_preparacion',40),
        (v_wf,'en_preparacion','preparado',40),
        (v_wf,'preparado','en_reparto',40),
        (v_wf,'en_reparto','entregado',40);

      insert into public.workflow_transitions (workflow_id, from_state, to_state, min_level, label)
      select v_wf, s.key, 'cancelado', 60, 'Cancelar'
      from public.workflow_states s
      where s.workflow_id = v_wf and not s.is_final and not s.is_cancel;
    end if;
  end loop;
end $$;

-- Los pedidos existentes arrancan con el estado que ya tenian
update public.orders set workflow_state = status::text where workflow_state is null;