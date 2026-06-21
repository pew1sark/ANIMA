-- ===========================================================
-- ANIMA TSC — Migración 0020: El Árbol Vivo del Mundo
--
-- El corazón vivo de ANIMA. No es decoración ni una barra de
-- progreso: reacciona a cada acción de las Almas.
--
--   Toda acción deja una Huella.
--   Toda Huella altera el Árbol.
--   El Árbol cuenta la historia viva de ANIMA.
--
-- Da cuerpo a cuatro tablas:
--   1. world_tree_state        · estado global del Árbol (fila única)
--   2. world_tree_events       · cada acción registrada (historia viva)
--   3. world_tree_nodes        · hojas, frutos, flores, raíces, ramas
--   4. world_tree_connections  · constelaciones (Almas conectadas)
--
-- Lectura pública (el Árbol es de todos). Las escrituras pasan por
-- world_tree_record(), una función security definer acotada al Alma
-- del que llama: suma Esencia, actualiza contadores, recalcula el
-- Estado del Mundo y detecta Fenómenos.
--
-- Esencia por acción:
--   Alma +10 · Huella +7 · Chispa +1 · Eco +3 · Memoria +5
--   Constelación +15 · Nivel +20 · Ritual +12
--
-- CÓMO APLICAR:
--   Supabase → SQL Editor → New query → pega TODO → Run.  (Idempotente)
-- ===========================================================

-- ===========================================================
-- 1. ESTADO DEL ÁRBOL — fila única (id = 1)
-- ===========================================================
create table if not exists public.world_tree_state (
  id                    int primary key default 1 check (id = 1),
  energy                bigint  not null default 0,
  resonance             int     not null default 0,
  growth_level          int     not null default 1,
  world_state           text    not null default 'LATENTE',
  active_phenomenon     text,
  phenomenon_until      timestamptz,
  total_almas           int     not null default 0,
  total_huellas         int     not null default 0,
  total_chispas         int     not null default 0,
  total_ecos            int     not null default 0,
  total_memorias        int     not null default 0,
  total_constelaciones  int     not null default 0,
  last_updated          timestamptz not null default now()
);
insert into public.world_tree_state (id) values (1) on conflict (id) do nothing;
alter table public.world_tree_state enable row level security;
drop policy if exists "wts_public_read" on public.world_tree_state;
create policy "wts_public_read" on public.world_tree_state for select using (true);

-- ===========================================================
-- 2. EVENTOS DEL ÁRBOL — la historia viva
-- ===========================================================
create table if not exists public.world_tree_events (
  id           uuid primary key default gen_random_uuid(),
  type         text not null,                 -- alma | huella | chispa | eco | memoria | constelacion | nivel | ritual
  alma_id      uuid references public.almas(id) on delete set null,
  alma_name    text,
  target_id    uuid,
  branch       text,
  title        text,
  description  text,
  energy_delta int not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists wte_created_idx on public.world_tree_events(created_at desc);
create index if not exists wte_type_idx on public.world_tree_events(type, created_at desc);
alter table public.world_tree_events enable row level security;
drop policy if exists "wte_public_read" on public.world_tree_events;
create policy "wte_public_read" on public.world_tree_events for select using (true);

-- ===========================================================
-- 3. NODOS DEL ÁRBOL — hojas/flores/frutos/raíces/ramas
-- ===========================================================
create table if not exists public.world_tree_nodes (
  id          uuid primary key default gen_random_uuid(),
  type        text not null,                  -- leaf | flower | fruit | root | branchlight
  alma_id     uuid references public.almas(id) on delete set null,
  huella_id   uuid,
  branch      text,
  x_position  real,
  y_position  real,
  state       text default 'vivo',
  created_at  timestamptz not null default now()
);
create index if not exists wtn_created_idx on public.world_tree_nodes(created_at desc);
alter table public.world_tree_nodes enable row level security;
drop policy if exists "wtn_public_read" on public.world_tree_nodes;
create policy "wtn_public_read" on public.world_tree_nodes for select using (true);

-- ===========================================================
-- 4. CONEXIONES — constelaciones entre Almas
-- ===========================================================
create table if not exists public.world_tree_connections (
  id          uuid primary key default gen_random_uuid(),
  alma_a      uuid references public.almas(id) on delete cascade,
  alma_b      uuid references public.almas(id) on delete cascade,
  type        text default 'constelacion',
  strength    int  not null default 1,
  created_at  timestamptz not null default now()
);
alter table public.world_tree_connections enable row level security;
drop policy if exists "wtc_public_read" on public.world_tree_connections;
create policy "wtc_public_read" on public.world_tree_connections for select using (true);

-- ===========================================================
-- LÓGICA: registrar una acción → repercusión en el Árbol
-- ===========================================================
create or replace function public.world_tree_record(
  p_type   text,
  p_branch text default null,
  p_target uuid default null,
  p_energy int  default null,
  p_title  text default null,
  p_desc   text default null
)
returns public.world_tree_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alma   uuid;
  v_name   text;
  v_ctry   text;
  v_nick   text;
  v_delta  int;
  v_state  public.world_tree_state;
  v_new_country boolean := false;
  v_chispas_hour int;
  v_memorias_day int;
  v_colab_day    int;
  v_ph     text;
begin
  -- Esencia oficial por acción (no se confía en el cliente).
  v_delta := case p_type
    when 'alma' then 10 when 'huella' then 7 when 'chispa' then 1
    when 'eco' then 3 when 'memoria' then 5 when 'constelacion' then 15
    when 'nivel' then 20 when 'ritual' then 12 else 0 end;

  select id, name, country into v_alma, v_name, v_ctry
    from public.almas where user_id = auth.uid();
  v_nick := split_part(coalesce(v_name, 'Una Alma'), ' ', 1);

  -- ¿Primer Alma de un nuevo país? (para "Nueva Estrella")
  if p_type = 'alma' and v_ctry is not null then
    select not exists (
      select 1 from public.world_tree_events
      where type = 'alma' and description ilike '%' || v_ctry || '%'
    ) into v_new_country;
  end if;

  -- Registrar el evento (historia viva).
  insert into public.world_tree_events (type, alma_id, alma_name, target_id, branch, title, description, energy_delta)
  values (p_type, v_alma, v_nick, p_target, p_branch, p_title, p_desc, v_delta);

  -- Un nodo por acción.
  if p_type in ('alma') then
    insert into public.world_tree_nodes (type, alma_id, branch) values ('leaf', v_alma, p_branch);
  elsif p_type = 'huella' then
    insert into public.world_tree_nodes (type, alma_id, branch) values ('branchlight', v_alma, p_branch);
  elsif p_type = 'memoria' then
    insert into public.world_tree_nodes (type, alma_id) values ('fruit', v_alma);
  elsif p_type = 'nivel' then
    insert into public.world_tree_nodes (type, alma_id) values ('flower', v_alma);
  elsif p_type in ('eco', 'chispa', 'constelacion', 'ritual') then
    insert into public.world_tree_nodes (type, alma_id) values ('root', v_alma);
  end if;

  -- Actualizar contadores + Esencia (fila única).
  update public.world_tree_state set
    energy               = energy + v_delta,
    total_almas          = total_almas          + (p_type = 'alma')::int,
    total_huellas        = total_huellas        + (p_type = 'huella')::int,
    total_chispas        = total_chispas        + (p_type = 'chispa')::int,
    total_ecos           = total_ecos           + (p_type = 'eco')::int,
    total_memorias       = total_memorias       + (p_type = 'memoria')::int,
    total_constelaciones = total_constelaciones + (p_type = 'constelacion')::int,
    last_updated         = now()
  where id = 1
  returning * into v_state;

  -- Madurez del Árbol (0..7) según Esencia.
  v_state.growth_level := 1
    + (v_state.energy >= 60)::int + (v_state.energy >= 200)::int
    + (v_state.energy >= 500)::int + (v_state.energy >= 1200)::int
    + (v_state.energy >= 3000)::int + (v_state.energy >= 8000)::int;

  -- Estado del Mundo según actividad reciente (últimos 20 min).
  with r as (
    select type, count(*) c from public.world_tree_events
    where created_at > now() - interval '20 minutes' group by type
  ), agg as (
    select
      coalesce(sum(c) filter (where type in ('chispa','eco')),0) as resonance,
      coalesce(sum(c) filter (where type = 'alma'),0)*2 + coalesce(sum(c) filter (where type='huella'),0) as bloom,
      coalesce(sum(c) filter (where type = 'constelacion'),0)*2 + coalesce(sum(c) filter (where type='memoria'),0) as luminous,
      coalesce(sum(c),0) as total
    from r
  )
  select case
    when (select count(*) from public.world_tree_events where created_at > now() - interval '5 minutes') >= 22 then 'DESPERTAR'
    when luminous >= 6 then 'LUMINOSO'
    when bloom >= 7 then 'FLORECIENDO'
    when resonance >= 8 then 'RESONANDO'
    when total > 0 then 'SERENO'
    else 'LATENTE' end,
    resonance
  into v_state.world_state, v_state.resonance from agg;

  -- Fenómenos del Mundo.
  select count(*) into v_chispas_hour from public.world_tree_events where type='chispa' and created_at > now() - interval '1 hour';
  select count(*) into v_memorias_day from public.world_tree_events where type='memoria' and created_at > now() - interval '24 hours';
  select count(*) into v_colab_day    from public.world_tree_events where type='constelacion' and created_at > now() - interval '24 hours';

  v_ph := null;
  if p_type = 'nivel' and p_title ilike '%ANIMA%' then v_ph := 'Aurora';
  elsif v_state.growth_level >= 7 then v_ph := 'Origen Renacido';
  elsif v_state.total_almas >= 1000 then v_ph := 'Latido Mayor';
  elsif v_chispas_hour >= 100 then v_ph := 'Lluvia de Ecos';
  elsif v_memorias_day >= 50 then v_ph := 'Fruto del Árbol';
  elsif v_colab_day >= 10 then v_ph := 'Nueva Rama';
  elsif p_type = 'alma' and v_new_country then v_ph := 'Nueva Estrella';
  end if;

  if v_ph is not null then
    v_state.active_phenomenon := v_ph;
    v_state.phenomenon_until := now() + interval '90 seconds';
  elsif v_state.phenomenon_until is not null and v_state.phenomenon_until < now() then
    v_state.active_phenomenon := null;
  end if;

  update public.world_tree_state set
    growth_level = v_state.growth_level, world_state = v_state.world_state,
    resonance = v_state.resonance, active_phenomenon = v_state.active_phenomenon,
    phenomenon_until = v_state.phenomenon_until
  where id = 1;

  return v_state;
end;
$$;
grant execute on function public.world_tree_record(text, text, uuid, int, text, text) to authenticated;

-- ===========================================================
-- LECTURA: estado del Árbol + últimos eventos (en un solo JSON)
-- ===========================================================
create or replace function public.world_tree_get()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select to_jsonb(s) || jsonb_build_object(
    'events',
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'type', e.type, 'title', e.title, 'description', e.description,
        'energy_delta', e.energy_delta, 'alma_name', e.alma_name, 'created_at', e.created_at
      ) order by e.created_at desc)
      from (select * from public.world_tree_events order by created_at desc limit 30) e
    ), '[]'::jsonb)
  )
  from public.world_tree_state s where s.id = 1;
$$;
grant execute on function public.world_tree_get() to anon, authenticated;

-- Ecos del Árbol en vivo (Realtime) para el estado y los eventos.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='world_tree_events') then
    alter publication supabase_realtime add table public.world_tree_events;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='world_tree_state') then
    alter publication supabase_realtime add table public.world_tree_state;
  end if;
end $$;

-- Fin 0020.
