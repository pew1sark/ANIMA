-- 0027 · Clanes como entidad real + gestión por el Admin del Clan
-- Aditivo: nueva tabla clans (por nombre, la clave que ya usan las Almas y las
-- tablas del Clan) + RPCs security-definer con control de permisos (Admin del
-- Clan o Creador). No borra ni altera datos existentes.

create table if not exists public.clans (
  name        text primary key,
  emoji       text not null default '❂',
  description text,
  santuario   text,
  created_by  uuid references public.almas(id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table public.clans enable row level security;
drop policy if exists "clans public read" on public.clans;
create policy "clans public read" on public.clans for select using (true);
-- La escritura es SOLO vía las RPC de abajo (security definer).

-- Registra los Clanes que ya existen (por nombre) sin duplicar.
insert into public.clans(name, emoji)
select distinct a.clan, '❂' from public.almas a
where coalesce(trim(a.clan),'')<>'' and not exists (select 1 from public.clans c where c.name=a.clan);

-- ¿El llamante es Admin de este Clan (o el Creador)?
create or replace function public.is_clan_admin(p_clan text)
returns boolean language sql security definer set search_path='public' stable as $$
  select lower(coalesce(auth.jwt()->>'email',''))='sarkgraff@gmail.com'
      or exists(select 1 from public.almas a where a.user_id=auth.uid() and a.clan=p_clan and a.team_role='ADMIN');
$$;
grant execute on function public.is_clan_admin(text) to authenticated;

create or replace function public.clan_create(p_name text, p_emoji text, p_desc text)
returns text language plpgsql security definer set search_path='public' as $$
declare v_me uuid;
begin
  select id into v_me from public.almas where user_id=auth.uid() limit 1;
  if v_me is null then raise exception 'Sin Alma para esta sesión.'; end if;
  p_name:=trim(coalesce(p_name,'')); if p_name='' then raise exception 'El Clan necesita un nombre.'; end if;
  if exists(select 1 from public.clans where lower(name)=lower(p_name)) then raise exception 'Ya existe un Clan con ese nombre.'; end if;
  insert into public.clans(name,emoji,description,created_by) values(p_name, coalesce(nullif(trim(p_emoji),''),'❂'), nullif(trim(p_desc),''), v_me);
  update public.almas set clan=p_name, team_role='ADMIN', plan=case when coalesce(plan,'ALMA')='ALMA' then 'CLAN' else plan end where id=v_me;
  return p_name;
end; $$;
grant execute on function public.clan_create(text,text,text) to authenticated;

create or replace function public.clan_update(p_name text, p_emoji text, p_desc text)
returns void language plpgsql security definer set search_path='public' as $$
begin
  if not public.is_clan_admin(p_name) then raise exception 'Solo el Admin del Clan puede editarlo.'; end if;
  update public.clans set emoji=coalesce(nullif(trim(p_emoji),''),emoji), description=nullif(trim(p_desc),'') where name=p_name;
end; $$;
grant execute on function public.clan_update(text,text,text) to authenticated;

create or replace function public.clan_rename(p_old text, p_new text)
returns text language plpgsql security definer set search_path='public' as $$
begin
  if not public.is_clan_admin(p_old) then raise exception 'Solo el Admin del Clan puede renombrarlo.'; end if;
  p_new:=trim(coalesce(p_new,'')); if p_new='' then raise exception 'Nombre inválido.'; end if;
  if lower(p_new)<>lower(p_old) and exists(select 1 from public.clans where lower(name)=lower(p_new)) then raise exception 'Ya existe un Clan con ese nombre.'; end if;
  update public.clans       set name=p_new where name=p_old;
  update public.almas       set clan=p_new where clan=p_old;
  update public.team_tasks  set clan=p_new where clan=p_old;
  update public.clan_events set clan=p_new where clan=p_old;
  update public.clan_projects set clan=p_new where clan=p_old;
  update public.clan_invites set clan=p_new where clan=p_old;
  update public.reminders   set clan=p_new where clan=p_old;
  return p_new;
end; $$;
grant execute on function public.clan_rename(text,text) to authenticated;

create or replace function public.clan_delete(p_name text)
returns void language plpgsql security definer set search_path='public' as $$
begin
  if not public.is_clan_admin(p_name) then raise exception 'Solo el Admin del Clan puede eliminarlo.'; end if;
  update public.almas set clan=null, team_role=null where clan=p_name;
  delete from public.team_tasks   where clan=p_name;
  delete from public.clan_events  where clan=p_name;
  delete from public.clan_projects where clan=p_name;
  delete from public.clan_invites where clan=p_name;
  delete from public.reminders    where clan=p_name;
  delete from public.clans where name=p_name;
end; $$;
grant execute on function public.clan_delete(text) to authenticated;

create or replace function public.clan_set_role(p_alma uuid, p_role text)
returns void language plpgsql security definer set search_path='public' as $$
declare v_clan text;
begin
  select clan into v_clan from public.almas where id=p_alma;
  if v_clan is null then raise exception 'Esa Alma no está en un Clan.'; end if;
  if not public.is_clan_admin(v_clan) then raise exception 'Solo el Admin del Clan asigna roles.'; end if;
  if p_role not in ('ADMIN','LIDER','ALMA') then raise exception 'Rol inválido.'; end if;
  update public.almas set team_role=p_role where id=p_alma;
end; $$;
grant execute on function public.clan_set_role(uuid,text) to authenticated;

create or replace function public.clan_remove_member(p_alma uuid)
returns void language plpgsql security definer set search_path='public' as $$
declare v_clan text;
begin
  select clan into v_clan from public.almas where id=p_alma;
  if v_clan is null then return; end if;
  if not public.is_clan_admin(v_clan) then raise exception 'Solo el Admin del Clan puede quitar Almas.'; end if;
  update public.almas set clan=null, team_role=null where id=p_alma;
end; $$;
grant execute on function public.clan_remove_member(uuid) to authenticated;

create or replace function public.clan_add_member(p_alma uuid, p_clan text)
returns void language plpgsql security definer set search_path='public' as $$
begin
  if not public.is_clan_admin(p_clan) then raise exception 'Solo el Admin del Clan puede sumar Almas.'; end if;
  update public.almas set clan=p_clan, team_role='ALMA', plan=case when coalesce(plan,'ALMA')='ALMA' then 'CLAN' else plan end where id=p_alma;
end; $$;
grant execute on function public.clan_add_member(uuid,text) to authenticated;
