-- 0029 · Toda Alma puede abandonar su Clan o su Santuario (auto-gestión)
-- Aditivo y seguro: RPCs security-definer que sólo afectan al Alma que llama.
-- Si el Admin abandona el Clan, el liderazgo se transfiere a otra Alma (o, si
-- queda vacío, el Clan se disuelve con todo su Plan/Calendario/Proyectos).

-- Un Alma abandona su propio Clan.
create or replace function public.clan_leave()
returns void language plpgsql security definer set search_path='public' as $$
declare v_me uuid; v_clan text; v_role text; v_heir uuid;
begin
  select id, clan, team_role into v_me, v_clan, v_role
    from public.almas where user_id=auth.uid() limit 1;
  if v_me is null or v_clan is null then return; end if;

  if v_role='ADMIN' then
    -- Busca heredero: primero un Líder, luego el Alma más antigua del Clan.
    select id into v_heir from public.almas
      where clan=v_clan and id<>v_me
      order by (team_role='LIDER') desc, created_at asc
      limit 1;
    if v_heir is not null then
      update public.almas set team_role='ADMIN' where id=v_heir;
    else
      -- Nadie más: el Clan se disuelve.
      delete from public.team_tasks    where clan=v_clan;
      delete from public.clan_events   where clan=v_clan;
      delete from public.clan_projects where clan=v_clan;
      delete from public.clan_invites  where clan=v_clan;
      delete from public.reminders     where clan=v_clan;
      delete from public.clans where name=v_clan;
    end if;
  end if;

  -- El Alma queda libre (también sale del Santuario asociado a ese Clan).
  update public.almas set clan=null, team_role=null,
         santuario=case when santuario=v_clan then null else santuario end
   where id=v_me;
end; $$;
grant execute on function public.clan_leave() to authenticated;

-- Un Alma abandona su Santuario (mantiene su Clan).
create or replace function public.santuario_leave()
returns void language plpgsql security definer set search_path='public' as $$
declare v_me uuid;
begin
  select id into v_me from public.almas where user_id=auth.uid() limit 1;
  if v_me is null then return; end if;
  update public.almas set santuario=null where id=v_me;
end; $$;
grant execute on function public.santuario_leave() to authenticated;
