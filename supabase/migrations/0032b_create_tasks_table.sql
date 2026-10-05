-- =====================================================================
-- 0032b · Tareas del Taller
--
-- RECUPERADA de supabase_migrations.schema_migrations (versión 20260624084412, «create_tasks_table»).
-- Ya está aplicada en producción: se aplicó a mano y nunca tuvo archivo.
-- Se agrega para que el repo reconstruya la base desde cero
-- (supabase/tests/reconstruir). El SQL va tal como se aplicó.
-- =====================================================================

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  alma_id uuid not null references public.almas(id) on delete cascade,
  title text not null,
  priority text not null default 'media',
  status text not null default 'pendiente',
  due_at date,
  project text,
  notes text,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.tasks enable row level security;
drop policy if exists tasks_own on public.tasks;
create policy tasks_own on public.tasks for all using (owns_alma(alma_id)) with check (owns_alma(alma_id));
create index if not exists tasks_alma_idx on public.tasks(alma_id);
