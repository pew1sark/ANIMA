-- 0031 · Santuario PRO — organización a gran escala (8+ Almas)
-- Aditivo y seguro. Convierte el Santuario en un espacio operativo como el Clan
-- pero para grupos grandes: entidad propia, membresía directa (por código o por
-- el Admin), tareas/proyectos enriquecidos e informes de actividad por Alma.
-- Reutiliza in_my_santuario()/admin_santuario()/is_creator() (0011/0030).

-- 1 · Entidad Santuario (identidad: símbolo y descripción) -------------------
create table if not exists public.santuarios (
  name        text primary key,
  emoji       text not null default '🜁',
  description text,
  created_by  uuid references public.almas(id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table public.santuarios enable row level security;
drop policy if exists "santuarios read" on public.santuarios;
create policy "santuarios read" on public.santuarios for select using (true);
-- Registra Santuarios que ya existen por nombre.
insert into public.santuarios(name, emoji)
select distinct a.santuario, '🜁' from public.almas a
where coalesce(trim(a.santuario),'')<>'' and not exists (select 1 from public.santuarios s where s.name=a.santuario);

-- 2 · Tareas y proyectos enriquecidos (formularios profesionales) ------------
alter table public.santuario_tasks    add column if not exists description text;
alter table public.santuario_tasks    add column if not exists area text;
alter table public.santuario_tasks    add column if not exists priority text;
alter table public.santuario_tasks    add column if not exists start_date date;
alter table public.santuario_tasks    add column if not exists due_at date;
alter table public.santuario_tasks    add column if not exists notes text;
alter table public.santuario_projects  add column if not exists description text;
alter table public.santuario_projects  add column if not exists area text;
alter table public.santuario_projects  add column if not exists notes text;

-- 3 · Informes de actividad por Alma -----------------------------------------
create table if not exists public.santuario_reports (
  id uuid primary key default gen_random_uuid(),
  santuario text not null,
  alma_id   uuid references public.almas(id) on delete cascade,
  author    text,
  title     text not null,
  body      text,
  period    text,
  status    text not null default 'Enviado',
  created_at timestamptz not null default now()
);
create index if not exists santuario_reports_idx on public.santuario_reports(santuario);
alter table public.santuario_reports enable row level security;
drop policy if exists "santuario_reports_select" on public.santuario_reports;
create policy "santuario_reports_select" on public.santuario_reports for select
  using (public.in_my_santuario(santuario) or public.is_creator());
drop policy if exists "santuario_reports_insert" on public.santuario_reports;
create policy "santuario_reports_insert" on public.santuario_reports for insert
  with check ((public.in_my_santuario(santuario) and exists(select 1 from public.almas a where a.id=alma_id and a.user_id=auth.uid())) or public.is_creator());
drop policy if exists "santuario_reports_update" on public.santuario_reports;
create policy "santuario_reports_update" on public.santuario_reports for update
  using (public.admin_santuario(santuario) or exists(select 1 from public.almas a where a.id=alma_id and a.user_id=auth.uid()));
drop policy if exists "santuario_reports_delete" on public.santuario_reports;
create policy "santuario_reports_delete" on public.santuario_reports for delete
  using (public.admin_santuario(santuario) or exists(select 1 from public.almas a where a.id=alma_id and a.user_id=auth.uid()));

-- 4 · Códigos de invitación del Santuario ------------------------------------
create table if not exists public.santuario_invites (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  santuario text not null,
  role text not null default 'ALMA',
  created_by uuid default auth.uid(),
  created_at timestamptz default now(),
  active boolean default true
);
alter table public.santuario_invites enable row level security;
drop policy if exists "santuario_invites_select" on public.santuario_invites;
create policy "santuario_invites_select" on public.santuario_invites for select
  using (public.admin_santuario(santuario) or public.is_creator());
drop policy if exists "santuario_invites_insert" on public.santuario_invites;
create policy "santuario_invites_insert" on public.santuario_invites for insert
  with check (public.admin_santuario(santuario) or public.is_creator());
drop policy if exists "santuario_invites_delete" on public.santuario_invites;
create policy "santuario_invites_delete" on public.santuario_invites for delete
  using (public.admin_santuario(santuario) or public.is_creator());

-- 5 · RPCs de gestión --------------------------------------------------------
-- Fundar un Santuario (como un Clan; es el espacio para grupos grandes, 8+).
create or replace function public.santuario_create(p_name text, p_emoji text, p_desc text)
returns text language plpgsql security definer set search_path='public' as $$
declare v_me uuid; v_has text;
begin
  select id, santuario into v_me, v_has from public.almas where user_id=auth.uid() limit 1;
  if v_me is null then raise exception 'Sin Alma para esta sesión.'; end if;
  if coalesce(trim(v_has),'')<>'' then raise exception 'Ya perteneces a un Santuario.'; end if;
  p_name:=trim(coalesce(p_name,'')); if p_name='' then raise exception 'El Santuario necesita un nombre.'; end if;
  if exists(select 1 from public.santuarios where lower(name)=lower(p_name)) then raise exception 'Ya existe un Santuario con ese nombre.'; end if;
  insert into public.santuarios(name,emoji,description,created_by)
    values(p_name, coalesce(nullif(trim(p_emoji),''),'🜁'), nullif(trim(p_desc),''), v_me);
  update public.almas set santuario=p_name, team_role='ADMIN', plan='SANTUARIO' where id=v_me;
  return p_name;
end; $$;
grant execute on function public.santuario_create(text,text,text) to authenticated;

create or replace function public.santuario_update(p_name text, p_emoji text, p_desc text)
returns void language plpgsql security definer set search_path='public' as $$
begin
  if not public.admin_santuario(p_name) then raise exception 'Solo el Admin del Santuario puede editarlo.'; end if;
  update public.santuarios set emoji=coalesce(nullif(trim(p_emoji),''),emoji), description=nullif(trim(p_desc),'') where name=p_name;
end; $$;
grant execute on function public.santuario_update(text,text,text) to authenticated;

create or replace function public.santuario_set_role(p_alma uuid, p_role text)
returns void language plpgsql security definer set search_path='public' as $$
declare v_s text;
begin
  select santuario into v_s from public.almas where id=p_alma;
  if v_s is null then raise exception 'Esa Alma no está en un Santuario.'; end if;
  if not public.admin_santuario(v_s) then raise exception 'Solo el Admin del Santuario asigna roles.'; end if;
  if p_role not in ('ADMIN','LIDER','ALMA') then raise exception 'Rol inválido.'; end if;
  update public.almas set team_role=p_role where id=p_alma;
end; $$;
grant execute on function public.santuario_set_role(uuid,text) to authenticated;

-- Suma a CUALQUIER Alma del Mundo al Santuario (invitación directa del Admin).
create or replace function public.santuario_add_member(p_alma uuid, p_santuario text)
returns void language plpgsql security definer set search_path='public' as $$
begin
  if not public.admin_santuario(p_santuario) then raise exception 'Solo el Admin del Santuario puede sumar Almas.'; end if;
  update public.almas
     set santuario=p_santuario,
         plan=case when coalesce(plan,'ALMA') in ('ALMA','CLAN') then 'SANTUARIO' else plan end,
         team_role=coalesce(team_role,'ALMA')
   where id=p_alma;
end; $$;
grant execute on function public.santuario_add_member(uuid,text) to authenticated;

create or replace function public.santuario_remove_member(p_alma uuid)
returns void language plpgsql security definer set search_path='public' as $$
declare v_s text; v_clan text;
begin
  select santuario, clan into v_s, v_clan from public.almas where id=p_alma;
  if v_s is null then return; end if;
  if not public.admin_santuario(v_s) then raise exception 'Solo el Admin del Santuario puede quitar Almas.'; end if;
  update public.almas set santuario=null,
         plan=case when coalesce(v_clan,'')<>'' then 'CLAN' else 'ALMA' end
   where id=p_alma;
end; $$;
grant execute on function public.santuario_remove_member(uuid) to authenticated;

create or replace function public.santuario_gen_invite(p_santuario text, p_role text)
returns text language plpgsql security definer set search_path='public' as $$
declare v_code text;
begin
  if not public.admin_santuario(p_santuario) then raise exception 'Solo el Admin genera códigos.'; end if;
  v_code := 'SANT-'||upper(substr(md5(random()::text),1,4));
  insert into public.santuario_invites(code,santuario,role) values(v_code, p_santuario, coalesce(nullif(p_role,''),'ALMA'));
  return v_code;
end; $$;
grant execute on function public.santuario_gen_invite(text,text) to authenticated;

create or replace function public.santuario_join_by_code(p_code text)
returns text language plpgsql security definer set search_path='public' as $$
declare inv public.santuario_invites;
begin
  select * into inv from public.santuario_invites where code=p_code and active=true limit 1;
  if inv.id is null then raise exception 'Código inválido o inactivo.'; end if;
  update public.almas
     set santuario=inv.santuario,
         team_role=coalesce(team_role,'ALMA'),
         plan=case when coalesce(plan,'ALMA') in ('ALMA','CLAN') then 'SANTUARIO' else plan end
   where user_id=auth.uid();
  return inv.santuario;
end; $$;
grant execute on function public.santuario_join_by_code(text) to authenticated;
