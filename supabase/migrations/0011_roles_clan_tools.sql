-- ===========================================================
-- ANIMA TSC — Migración 0011: Sistema de roles + herramientas de Clan/Santuario
--
-- Da forma al reparto de poder de cada umbral:
--   · Rol COLABORADOR (entre Miembro y Líder): puede crear/editar en el Clan.
--   · El LÍDER administra a SU gente (asigna roles) sin pasar por el Creador.
--   · Santuario agrupa varios Clanes (columna almas.santuario); el ADMIN coordina.
--   · Herramientas sincronizadas: calendario, proyectos del Clan y códigos de invitación.
--
-- Escalera de roles: MIEMBRO < COLABORADOR < LIDER < ADMIN  (+ Creador por encima).
--
-- CÓMO APLICAR:
--   Supabase → SQL Editor → New query → pega TODO → Run.  (Idempotente)
--   Requiere 0005 (is_creator) y 0006 (in_my_clan, leads_clan).
-- ===========================================================

-- ---------- 1. Santuario: agrupa Clanes ----------
alter table public.almas add column if not exists santuario text;

-- ¿La sesión pertenece a este Santuario?
create or replace function public.in_my_santuario(p_s text)
returns boolean language sql stable set search_path = '' as $$
  select exists (select 1 from public.almas
    where user_id = auth.uid() and santuario is not null and santuario = p_s);
$$;

-- ¿La sesión ADMINISTRA este Santuario? (Admin del santuario o Creador)
create or replace function public.admin_santuario(p_s text)
returns boolean language sql stable set search_path = '' as $$
  select public.is_creator() or exists (select 1 from public.almas
    where user_id = auth.uid() and santuario = p_s and team_role = 'ADMIN');
$$;

-- ¿La sesión puede EDITAR contenido de este Clan? (Colaborador, Líder, Admin o Creador)
create or replace function public.can_edit_clan(p_clan text)
returns boolean language sql stable set search_path = '' as $$
  select public.leads_clan(p_clan) or exists (select 1 from public.almas
    where user_id = auth.uid() and clan = p_clan
      and team_role in ('COLABORADOR','LIDER','ADMIN'));
$$;

-- ---------- 2. El Líder/Admin administra a las Almas de su grupo ----------
-- Permite asignar roles y mover miembros dentro del propio Clan/Santuario.
drop policy if exists "almas_leader_update" on public.almas;
create policy "almas_leader_update" on public.almas
  for update
  using (public.leads_clan(clan) or public.admin_santuario(santuario))
  with check (public.leads_clan(clan) or public.admin_santuario(santuario));

-- ---------- 3. Calendario sincronizado del Clan ----------
create table if not exists public.clan_events (
  id uuid primary key default gen_random_uuid(),
  clan text not null,
  title text not null,
  at_date date,
  at_time text,
  kind text,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz default now()
);
create index if not exists clan_events_clan_idx on public.clan_events(clan);
alter table public.clan_events enable row level security;

drop policy if exists "clan_events_select" on public.clan_events;
create policy "clan_events_select" on public.clan_events for select
  using (public.in_my_clan(clan) or public.is_creator());
drop policy if exists "clan_events_insert" on public.clan_events;
create policy "clan_events_insert" on public.clan_events for insert
  with check (public.can_edit_clan(clan));
drop policy if exists "clan_events_update" on public.clan_events;
create policy "clan_events_update" on public.clan_events for update
  using (public.can_edit_clan(clan)) with check (public.can_edit_clan(clan));
drop policy if exists "clan_events_delete" on public.clan_events;
create policy "clan_events_delete" on public.clan_events for delete
  using (public.leads_clan(clan));

-- ---------- 4. Proyectos / encargos del Clan ----------
create table if not exists public.clan_projects (
  id uuid primary key default gen_random_uuid(),
  clan text not null,
  title text not null,
  assignee text,
  status text default 'Pendiente',     -- Pendiente | En curso | Revisión | Hecho
  pct int default 0,
  due_at date,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz default now()
);
create index if not exists clan_projects_clan_idx on public.clan_projects(clan);
alter table public.clan_projects enable row level security;

drop policy if exists "clan_projects_select" on public.clan_projects;
create policy "clan_projects_select" on public.clan_projects for select
  using (public.in_my_clan(clan) or public.is_creator());
drop policy if exists "clan_projects_insert" on public.clan_projects;
create policy "clan_projects_insert" on public.clan_projects for insert
  with check (public.can_edit_clan(clan));
drop policy if exists "clan_projects_update" on public.clan_projects;
create policy "clan_projects_update" on public.clan_projects for update
  using (public.can_edit_clan(clan)) with check (public.can_edit_clan(clan));
drop policy if exists "clan_projects_delete" on public.clan_projects;
create policy "clan_projects_delete" on public.clan_projects for delete
  using (public.leads_clan(clan));

-- ---------- 5. Códigos de invitación al Clan ----------
create table if not exists public.clan_invites (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  clan text not null,
  santuario text,
  role text not null default 'MIEMBRO',
  created_by uuid default auth.uid(),
  created_at timestamptz default now(),
  active boolean default true
);
create index if not exists clan_invites_clan_idx on public.clan_invites(clan);
alter table public.clan_invites enable row level security;

-- Solo el Líder/Admin del clan (o Creador) ve y gestiona sus códigos.
drop policy if exists "clan_invites_select" on public.clan_invites;
create policy "clan_invites_select" on public.clan_invites for select
  using (public.leads_clan(clan) or public.is_creator());
drop policy if exists "clan_invites_insert" on public.clan_invites;
create policy "clan_invites_insert" on public.clan_invites for insert
  with check (public.leads_clan(clan) or public.is_creator());
drop policy if exists "clan_invites_delete" on public.clan_invites;
create policy "clan_invites_delete" on public.clan_invites for delete
  using (public.leads_clan(clan) or public.is_creator());

-- Canjear un código: une el Alma de la sesión al Clan con el rol indicado.
-- security definer para poder leer el código y escribir el Alma con seguridad.
create or replace function public.join_clan_by_code(p_code text)
returns text language plpgsql security definer set search_path = '' as $$
declare inv public.clan_invites;
begin
  select * into inv from public.clan_invites where code = p_code and active = true limit 1;
  if inv.id is null then raise exception 'Código inválido o inactivo'; end if;
  update public.almas
     set clan = inv.clan,
         santuario = coalesce(inv.santuario, santuario),
         team_role = inv.role
   where user_id = auth.uid();
  return inv.clan;
end; $$;

grant execute on function public.join_clan_by_code(text) to authenticated;

-- Fin 0011.
