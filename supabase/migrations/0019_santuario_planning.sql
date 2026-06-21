-- ===========================================================
-- ANIMA TSC — Migración 0019: Planificación del Santuario
--
-- Los líderes/ADMIN de un Santuario planifican a gran escala, igual
-- que en el Panel de Clan, pero a nivel de organización:
--   · santuario_tasks    → tablero de tareas del Santuario
--   · santuario_projects → proyectos/encargos del Santuario
--   · santuario_events   → calendario del Santuario
--
-- Lectura: cualquier Alma del Santuario (in_my_santuario) o el Creador.
-- Escritura: el ADMIN del Santuario (admin_santuario) o el Creador.
--
-- CÓMO APLICAR: Supabase → SQL Editor → pega TODO → Run. (Idempotente)
-- ===========================================================

create table if not exists public.santuario_tasks (
  id uuid primary key default gen_random_uuid(),
  santuario text not null,
  title text not null,
  assignee text,
  status text not null default 'Pendiente',
  created_at timestamptz not null default now()
);
create index if not exists santuario_tasks_idx on public.santuario_tasks(santuario);
alter table public.santuario_tasks enable row level security;

create table if not exists public.santuario_projects (
  id uuid primary key default gen_random_uuid(),
  santuario text not null,
  title text not null,
  assignee text,
  due_at date,
  status text not null default 'Pendiente',
  pct integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists santuario_projects_idx on public.santuario_projects(santuario);
alter table public.santuario_projects enable row level security;

create table if not exists public.santuario_events (
  id uuid primary key default gen_random_uuid(),
  santuario text not null,
  title text not null,
  at_date date,
  at_time text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists santuario_events_idx on public.santuario_events(santuario);
alter table public.santuario_events enable row level security;

-- Políticas por tabla: leer si eres del Santuario (o Creador); escribir si
-- eres ADMIN del Santuario (o Creador).
do $$
declare t text;
begin
  foreach t in array array['santuario_tasks','santuario_projects','santuario_events'] loop
    execute format('drop policy if exists "%1$s_select" on public.%1$s;', t);
    execute format($p$create policy "%1$s_select" on public.%1$s for select
      using (public.in_my_santuario(santuario) or public.is_creator());$p$, t);

    execute format('drop policy if exists "%1$s_insert" on public.%1$s;', t);
    execute format($p$create policy "%1$s_insert" on public.%1$s for insert
      with check (public.admin_santuario(santuario) or public.is_creator());$p$, t);

    execute format('drop policy if exists "%1$s_update" on public.%1$s;', t);
    execute format($p$create policy "%1$s_update" on public.%1$s for update
      using (public.admin_santuario(santuario) or public.is_creator())
      with check (public.admin_santuario(santuario) or public.is_creator());$p$, t);

    execute format('drop policy if exists "%1$s_delete" on public.%1$s;', t);
    execute format($p$create policy "%1$s_delete" on public.%1$s for delete
      using (public.admin_santuario(santuario) or public.is_creator());$p$, t);
  end loop;
end $$;
-- Fin 0019.
