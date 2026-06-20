-- ===========================================================
-- ANIMA TSC — Migración 0006: Planes, Roles y herramientas de Clan
--
-- Da vida a los umbrales:
--   · plan  (ALMA / CLAN / SANTUARIO) por Alma  → qué ve cada quien
--   · team_role (MIEMBRO / LIDER / ADMIN)        → qué puede hacer en su Clan
--   · reminders   → recordatorios compartidos por Clan
--   · team_tasks  → tablero de tareas del equipo (Clan)
--
-- Acceso por Clan: un Alma ve/edita lo de SU clan (mismo slug en almas.clan).
-- El Líder/Admin (o el Creador) gestionan; los Miembros colaboran.
--
-- CÓMO APLICAR:
--   Supabase → SQL Editor → New query → pega TODO → Run.  (Idempotente)
--   Requiere haber corrido antes la 0005 (función public.is_creator()).
-- ===========================================================

-- ---------- 1. Plan y rol por Alma ----------
alter table public.almas add column if not exists plan      text default 'ALMA';   -- ALMA | CLAN | SANTUARIO
alter table public.almas add column if not exists team_role text;                  -- MIEMBRO | LIDER | ADMIN

-- ---------- 2. Helpers de pertenencia a Clan ----------
-- ¿La sesión pertenece a este clan? (alguna de sus Almas tiene ese clan)
create or replace function public.in_my_clan(p_clan text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.almas
    where user_id = auth.uid() and clan is not null and clan = p_clan
  );
$$;

-- ¿La sesión LIDERA este clan? (Líder/Admin del clan) — o es el Creador.
create or replace function public.leads_clan(p_clan text)
returns boolean
language sql
stable
as $$
  select public.is_creator() or exists (
    select 1 from public.almas
    where user_id = auth.uid() and clan = p_clan
      and team_role in ('LIDER','ADMIN')
  );
$$;

-- ---------- 3. Recordatorios del Clan ----------
create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  clan text not null,
  title text not null,
  due_at date,
  assignee text,
  done boolean default false,
  created_by uuid default auth.uid(),
  created_at timestamptz default now()
);
create index if not exists reminders_clan_idx on public.reminders(clan);
alter table public.reminders enable row level security;

-- Lee cualquier Alma del clan (o el Creador).
drop policy if exists "reminders_select_clan" on public.reminders;
create policy "reminders_select_clan" on public.reminders for select
  using (public.in_my_clan(clan) or public.is_creator());

-- Crea/edita: cualquier miembro del clan puede sumar y marcar; el Líder gestiona todo.
drop policy if exists "reminders_insert_clan" on public.reminders;
create policy "reminders_insert_clan" on public.reminders for insert
  with check (public.in_my_clan(clan) or public.is_creator());

drop policy if exists "reminders_update_clan" on public.reminders;
create policy "reminders_update_clan" on public.reminders for update
  using (public.in_my_clan(clan) or public.is_creator())
  with check (public.in_my_clan(clan) or public.is_creator());

-- Eliminar: solo Líder/Admin del clan (o Creador).
drop policy if exists "reminders_delete_clan" on public.reminders;
create policy "reminders_delete_clan" on public.reminders for delete
  using (public.leads_clan(clan));

-- ---------- 4. Tablero de tareas del equipo ----------
create table if not exists public.team_tasks (
  id uuid primary key default gen_random_uuid(),
  clan text not null,
  title text not null,
  assignee text,
  status text default 'Pendiente',     -- Pendiente | En curso | Hecho
  created_by uuid default auth.uid(),
  created_at timestamptz default now()
);
create index if not exists team_tasks_clan_idx on public.team_tasks(clan);
alter table public.team_tasks enable row level security;

drop policy if exists "team_tasks_select_clan" on public.team_tasks;
create policy "team_tasks_select_clan" on public.team_tasks for select
  using (public.in_my_clan(clan) or public.is_creator());

-- Crear tareas: solo el Líder/Admin del clan (o el Creador).
drop policy if exists "team_tasks_insert_clan" on public.team_tasks;
create policy "team_tasks_insert_clan" on public.team_tasks for insert
  with check (public.leads_clan(clan));

-- Avanzar estado: cualquier miembro del clan colabora.
drop policy if exists "team_tasks_update_clan" on public.team_tasks;
create policy "team_tasks_update_clan" on public.team_tasks for update
  using (public.in_my_clan(clan) or public.is_creator())
  with check (public.in_my_clan(clan) or public.is_creator());

drop policy if exists "team_tasks_delete_clan" on public.team_tasks;
create policy "team_tasks_delete_clan" on public.team_tasks for delete
  using (public.leads_clan(clan));

-- Fin 0006.
