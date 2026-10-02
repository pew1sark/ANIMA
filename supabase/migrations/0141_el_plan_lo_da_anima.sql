-- =====================================================================
-- 0141 · El plan lo da ANIMA, no el Alma
--
-- Toda Alma nace con plan ALMA (Starter). Pero había tres maneras de
-- subirse sola a Pro o Max sin pagar:
--
--   1. La política almas_update_own deja al dueño escribir CUALQUIER
--      columna de su fila. Un `update almas set plan = 'SANTUARIO'` desde
--      el navegador bastaba. Lo mismo con world_access y council.
--   2. clan_create() fundaba el Clan y, de paso, subía el plan a CLAN (Pro).
--   3. santuario_create() hacía lo mismo hacia SANTUARIO (Max).
--
-- La pantalla «Mi Alma → Forma» ofrecía los botones «Fundar Clan» y
-- «Fundar Santuario» a cualquier Starter, así que no hacía falta saber nada
-- de la API para usar 2 y 3.
--
-- Lo que queda:
--   · El plan, world_access y council solo los cambia el Creador (Consola)
--     o una función de la base. La escritura directa desde el navegador ya
--     no puede tocarlos (disparador almas_protege_el_plan).
--   · Fundar un Clan pide estar en Pro o Max; fundar un Santuario, en Max.
--     Ninguna de las dos sube el plan.
--   · Entrar a un Clan o Santuario con un código de invitación SÍ da el plan
--     del equipo: es un asiento que paga quien invitó. join_clan_by_code
--     ahora lo asigna aquí, porque antes lo hacía el navegador con un
--     UPDATE que el disparador ya no deja pasar.
-- =====================================================================

begin;

-- ── 1 · El disparador ───────────────────────────────────────────────
-- SECURITY INVOKER a propósito: current_user es el rol de quien escribe.
-- Desde PostgREST es `authenticated`; dentro de una función SECURITY DEFINER
-- (handle_new_user, clan_add_member, la Consola…) es su dueño, y pasa.
create or replace function public.almas_protege_el_plan()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if public.is_creator() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.plan         := 'ALMA';
    new.world_access := false;
    new.council      := false;
    return new;
  end if;

  if new.plan         is distinct from old.plan
  or new.world_access is distinct from old.world_access
  or new.council      is distinct from old.council then
    raise exception 'El plan lo asigna ANIMA. Para mejorarlo: animatsc.com/planes.html'
      using errcode = '42501';
  end if;
  return new;
end $fn$;

comment on function public.almas_protege_el_plan() is
  'Impide que un Alma cambie su propio plan, world_access o council desde el navegador. El Creador y las funciones de la base sí pueden.';

drop trigger if exists trg_almas_protege_el_plan on public.almas;
create trigger trg_almas_protege_el_plan
  before insert or update on public.almas
  for each row execute function public.almas_protege_el_plan();

-- ── 2 · Fundar un Clan pide Pro o Max, y no sube el plan ────────────
create or replace function public.clan_create(p_name text, p_emoji text, p_desc text)
returns text
language plpgsql
security definer
set search_path = public
as $function$
declare v_me uuid; v_plan text;
begin
  select id, coalesce(plan, 'ALMA') into v_me, v_plan from public.almas where user_id = auth.uid() limit 1;
  if v_me is null then raise exception 'Sin Alma para esta sesión.'; end if;
  if v_plan = 'ALMA' and not public.is_creator() then
    raise exception 'Fundar un Clan es parte del plan Pro. Puedes mejorarlo en animatsc.com/planes.html'
      using errcode = '42501';
  end if;
  p_name := trim(coalesce(p_name, '')); if p_name = '' then raise exception 'El Clan necesita un nombre.'; end if;
  if exists (select 1 from public.clans where lower(name) = lower(p_name)) then raise exception 'Ya existe un Clan con ese nombre.'; end if;
  insert into public.clans (name, emoji, description, created_by)
  values (p_name, coalesce(nullif(trim(p_emoji), ''), '❂'), nullif(trim(p_desc), ''), v_me);
  update public.almas set clan = p_name, team_role = 'ADMIN' where id = v_me;
  return p_name;
end; $function$;

-- ── 3 · Fundar un Santuario pide Max, y no sube el plan ─────────────
create or replace function public.santuario_create(p_name text, p_emoji text, p_desc text)
returns text
language plpgsql
security definer
set search_path = public
as $function$
declare v_me uuid; v_has text; v_plan text;
begin
  select id, santuario, coalesce(plan, 'ALMA') into v_me, v_has, v_plan from public.almas where user_id = auth.uid() limit 1;
  if v_me is null then raise exception 'Sin Alma para esta sesión.'; end if;
  if v_plan <> 'SANTUARIO' and not public.is_creator() then
    raise exception 'Fundar un Santuario es parte del plan Max. Puedes mejorarlo en animatsc.com/planes.html'
      using errcode = '42501';
  end if;
  if coalesce(trim(v_has), '') <> '' then raise exception 'Ya perteneces a un Santuario.'; end if;
  p_name := trim(coalesce(p_name, '')); if p_name = '' then raise exception 'El Santuario necesita un nombre.'; end if;
  if exists (select 1 from public.santuarios where lower(name) = lower(p_name)) then raise exception 'Ya existe un Santuario con ese nombre.'; end if;
  insert into public.santuarios (name, emoji, description, created_by)
    -- chr(128769) es el glifo del Santuario, escrito así porque el emoji literal rompe algunas herramientas.
    values (p_name, coalesce(nullif(trim(p_emoji), ''), chr(128769)), nullif(trim(p_desc), ''), v_me);
  update public.almas set santuario = p_name, team_role = 'ADMIN' where id = v_me;
  return p_name;
end; $function$;

-- ── 4 · Entrar a un Clan por código da el asiento del equipo ────────
create or replace function public.join_clan_by_code(p_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare inv public.clan_invites;
begin
  select * into inv from public.clan_invites where code = p_code and active = true limit 1;
  if inv.id is null then raise exception 'Código inválido o inactivo'; end if;
  update public.almas
     set clan      = inv.clan,
         santuario = coalesce(inv.santuario, santuario),
         team_role = inv.role,
         plan      = case when coalesce(plan, 'ALMA') = 'ALMA' then 'CLAN' else plan end
   where user_id = auth.uid();
  return inv.clan;
end; $function$;

commit;
