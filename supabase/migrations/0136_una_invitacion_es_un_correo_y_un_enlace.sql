begin;

-- ---------------------------------------------------------------------------
-- Una invitación es un correo y un enlace — se acabaron los códigos
-- ---------------------------------------------------------------------------
-- Hasta hoy entrar a ANIMA STUDIO pedía un "Código del Origen" escrito a mano,
-- y entrar a un Clan pedía otro código distinto (`clan_invites`), y a un
-- Santuario un tercero (`santuario_invites`). Tres cadenas de caracteres que
-- alguien copia en WhatsApp y pega mal.
--
-- Un código tiene dos problemas que no se arreglan haciéndolo más largo:
--
--   · No sabe a quién invita. Quien lo reciba y lo pegue entra. Si se filtra,
--     entra un desconocido con el rol que el código llevaba dentro.
--   · No abre ninguna puerta por sí mismo. Después de pegarlo hay que crear la
--     cuenta igual, con el formulario de siempre, y esperar acertar el correo.
--
-- Una invitación por correo resuelve las dos: va dirigida a una dirección, y el
-- enlace que llega a esa bandeja es el que crea la cuenta. Quien no tenga el
-- correo no tiene nada.
--
-- Esta tabla es la invitación. El correo lo manda la función edge
-- `invitacion-studio`, que es la única que tiene `service_role` y por tanto la
-- única que puede pedirle a Supabase que cree la cuenta. Como en la migración
-- 0119, la función edge NO decide: pregunta aquí.
--
-- Tres decisiones que conviene no perder de vista:
--
-- 1 · NO ES UN RELÉ DE CORREO. `preparar_envio_invitacion` solo responde
--     "manda" cuando la invitación existe, está viva y no se mandó hace nada.
--     Escribir la dirección de un desconocido no le manda nada a nadie.
--
-- 2 · EL SELLO DEL ENVÍO SE PONE AQUÍ, no en la función edge. Dos pulsaciones
--     seguidas no mandan dos correos: la segunda ya ve la marca de la primera.
--
-- 3 · LA INVITACIÓN SE APLICA SOLA AL ENTRAR. `aceptar_invitaciones_pendientes`
--     busca por el correo de la sesión, así que da igual si la persona llegó
--     por el enlace o entró por su cuenta días después: su Clan y su rol la
--     están esperando. Sin esto, un enlace caducado dejaría a alguien dentro de
--     ANIMA pero fuera de su equipo, sin manera de arreglarlo desde la app.

create table if not exists public.studio_invitations (
  id             uuid primary key default gen_random_uuid(),
  email          text        not null,
  token          text        not null unique,
  ambito         text        not null default 'clan'
                   check (ambito in ('studio','clan','santuario')),
  clan           text,
  santuario      text,
  team_role      text        not null default 'ALMA',
  plan           text,
  mensaje        text,
  invited_by     uuid        references auth.users(id) on delete set null,
  invited_by_nombre text,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null default (now() + interval '14 days'),
  sent_at        timestamptz,
  used_at        timestamptz,
  used_by        uuid        references auth.users(id) on delete set null,
  revoked_at     timestamptz
);

comment on table public.studio_invitations is
  'Invitaciones de ANIMA STUDIO. Una dirección de correo, un enlace y un destino (Clan, Santuario o la plataforma entera).';
comment on column public.studio_invitations.token is
  'Va en el enlace. Es lo único que prueba la invitación antes de que exista la cuenta, así que no se enseña en ninguna lista.';
comment on column public.studio_invitations.sent_at is
  'Cuándo salió el último correo. Frena los reenvíos.';

create unique index if not exists studio_invitations_viva_idx
  on public.studio_invitations (lower(email), coalesce(clan, ''), coalesce(santuario, ''))
  where used_at is null and revoked_at is null;

create index if not exists studio_invitations_clan_idx      on public.studio_invitations(clan);
create index if not exists studio_invitations_santuario_idx on public.studio_invitations(santuario);
create index if not exists studio_invitations_email_idx     on public.studio_invitations(lower(email));

alter table public.studio_invitations enable row level security;

-- Sin políticas: a esta tabla no se llega con un SELECT. Se llega con las
-- funciones de abajo, que son las que saben qué se puede enseñar y a quién.
-- En particular, `token` no sale nunca de una lista: solo lo devuelve la
-- función que crea la invitación, a quien la creó.
--
-- El permiso se quita además del RLS. Los permisos por defecto de Supabase
-- reparten SELECT sobre todo lo que se cree en `public`, y aquí dentro hay
-- tokens que abren cuentas: una sola capa no basta.
revoke all on public.studio_invitations from anon, authenticated;

-- ¿Puede esta sesión invitar a este destino? ---------------------------------
create or replace function public.puede_invitar(p_ambito text, p_clan text, p_santuario text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.is_creator() then true
    when p_ambito = 'clan'      and coalesce(p_clan,'')      <> '' then public.leads_clan(p_clan)
    when p_ambito = 'santuario' and coalesce(p_santuario,'') <> '' then public.admin_santuario(p_santuario)
    else false                      -- 'studio' invita solo el Creador
  end;
$$;

revoke execute on function public.puede_invitar(text, text, text) from public, anon;
grant  execute on function public.puede_invitar(text, text, text) to authenticated;

-- El token del enlace ---------------------------------------------------------
-- Dos uuid aleatorios pegados: 64 caracteres hexadecimales sin guiones. Se usa
-- `gen_random_uuid`, que ya viene en el núcleo de Postgres, para no depender de
-- que pgcrypto esté instalado en este proyecto ni de en qué esquema lo esté.
create or replace function public.nuevo_token_invitacion()
returns text
language sql
volatile
set search_path = ''
as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
$$;

revoke execute on function public.nuevo_token_invitacion() from public, anon, authenticated;

-- Crear una invitación --------------------------------------------------------
create or replace function public.crear_invitacion(
  p_email     text,
  p_ambito    text default 'clan',
  p_clan      text default null,
  p_santuario text default null,
  p_role      text default 'ALMA',
  p_plan      text default null,
  p_mensaje   text default null
) returns public.studio_invitations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_correo text := lower(btrim(coalesce(p_email, '')));
  v_rol    text := upper(btrim(coalesce(p_role, 'ALMA')));
  v_quien  text;
  v_fila   public.studio_invitations;
  v_miembros integer;
begin
  if position('@' in v_correo) = 0 or length(v_correo) < 5 then
    raise exception 'Escribe un correo válido.';
  end if;

  p_ambito := lower(btrim(coalesce(p_ambito, 'clan')));
  p_clan      := nullif(btrim(coalesce(p_clan, '')), '');
  p_santuario := nullif(btrim(coalesce(p_santuario, '')), '');

  if not public.puede_invitar(p_ambito, p_clan, p_santuario) then
    raise exception 'No puedes invitar a ese destino.';
  end if;

  -- El rol de Admin no se reparte por correo: lo traspasa quien ya lo tiene.
  if v_rol not in ('ALMA','LIDER') then
    v_rol := 'ALMA';
  end if;

  -- Un Clan son de dos a ocho Almas. Invitar a la novena es prometer algo que
  -- la puerta no va a cumplir, y es mejor decirlo ahora que cuando llegue.
  if p_ambito = 'clan' then
    select count(*) into v_miembros from public.almas where clan = p_clan;
    if v_miembros >= 8 then
      raise exception 'Este Clan ya reúne ocho Almas, que es su tope.';
    end if;
  end if;

  -- Quien ya está dentro no necesita invitación.
  if p_ambito = 'clan' and exists (
       select 1 from public.almas a join auth.users u on u.id = a.user_id
        where a.clan = p_clan and lower(u.email) = v_correo) then
    raise exception 'Esa persona ya está en el Clan.';
  end if;

  select coalesce(a.name, split_part(u.email, '@', 1)) into v_quien
    from auth.users u left join public.almas a on a.user_id = u.id
   where u.id = auth.uid();

  -- Reinvitar es renovar, no duplicar: el índice único ya lo impide y aquí se
  -- le da su sentido — mismo destino, enlace nuevo, catorce días más.
  insert into public.studio_invitations
    (email, token, ambito, clan, santuario, team_role, plan, mensaje,
     invited_by, invited_by_nombre)
  values
    (v_correo, public.nuevo_token_invitacion(),
     p_ambito, p_clan, p_santuario, v_rol, nullif(btrim(coalesce(p_plan,'')),''),
     nullif(btrim(coalesce(p_mensaje,'')),''), auth.uid(), v_quien)
  on conflict (lower(email), coalesce(clan, ''), coalesce(santuario, ''))
    where used_at is null and revoked_at is null
  do update
    set token             = public.nuevo_token_invitacion(),
        ambito            = excluded.ambito,
        team_role         = excluded.team_role,
        plan              = excluded.plan,
        mensaje           = coalesce(excluded.mensaje, studio_invitations.mensaje),
        invited_by        = excluded.invited_by,
        invited_by_nombre = excluded.invited_by_nombre,
        expires_at        = now() + interval '14 days',
        sent_at           = null,
        created_at        = now()
  returning * into v_fila;

  return v_fila;
end;
$$;

revoke execute on function public.crear_invitacion(text, text, text, text, text, text, text) from public, anon;
grant  execute on function public.crear_invitacion(text, text, text, text, text, text, text) to authenticated;

-- Listar las invitaciones de un destino (sin el token) ------------------------
create or replace function public.invitaciones(p_clan text default null, p_santuario text default null)
returns table (
  id            uuid,
  email         text,
  ambito        text,
  clan          text,
  santuario     text,
  team_role     text,
  plan          text,
  invitada_por  text,
  created_at    timestamptz,
  expires_at    timestamptz,
  sent_at       timestamptz,
  used_at       timestamptz,
  estado        text
)
language sql
security definer
stable
set search_path = ''
as $$
  select i.id, i.email, i.ambito, i.clan, i.santuario, i.team_role, i.plan,
         i.invited_by_nombre, i.created_at, i.expires_at, i.sent_at, i.used_at,
         case
           when i.used_at    is not null then 'aceptada'
           when i.revoked_at is not null then 'anulada'
           when i.expires_at <= now()    then 'vencida'
           when i.sent_at    is null     then 'sin-enviar'
           else 'enviada'
         end
    from public.studio_invitations i
   where (
           public.is_creator()
           or (i.clan      is not null and public.leads_clan(i.clan))
           or (i.santuario is not null and public.admin_santuario(i.santuario))
         )
     and (p_clan      is null or i.clan      = p_clan)
     and (p_santuario is null or i.santuario = p_santuario)
   order by i.created_at desc
   limit 200;
$$;

revoke execute on function public.invitaciones(text, text) from public, anon;
grant  execute on function public.invitaciones(text, text) to authenticated;

-- Anular una invitación --------------------------------------------------------
create or replace function public.anular_invitacion(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_i public.studio_invitations;
begin
  select * into v_i from public.studio_invitations where id = p_id;
  if v_i.id is null then return false; end if;

  if not public.puede_invitar(v_i.ambito, v_i.clan, v_i.santuario) then
    raise exception 'No puedes anular esa invitación.';
  end if;

  update public.studio_invitations set revoked_at = now() where id = p_id and used_at is null;
  return found;
end;
$$;

revoke execute on function public.anular_invitacion(uuid) from public, anon;
grant  execute on function public.anular_invitacion(uuid) to authenticated;

-- Lo que el enlace puede contar antes de que exista la cuenta ------------------
-- Lo pide el navegador de alguien que todavía no ha entrado, así que responde a
-- `anon`. Enseña el destino y el correo —hace falta para rellenar el formulario
-- y para que la persona sepa a qué la invitaron— y nada más. Quien no tenga el
-- token de 48 caracteres no obtiene ni eso.
create or replace function public.invitacion_por_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_i public.studio_invitations;
begin
  select * into v_i from public.studio_invitations
   where token = btrim(coalesce(p_token, '')) limit 1;

  if v_i.id is null then
    return jsonb_build_object('valida', false, 'motivo', 'no-existe');
  end if;
  if v_i.used_at is not null then
    return jsonb_build_object('valida', false, 'motivo', 'usada', 'correo', v_i.email);
  end if;
  if v_i.revoked_at is not null then
    return jsonb_build_object('valida', false, 'motivo', 'anulada');
  end if;
  if v_i.expires_at <= now() then
    return jsonb_build_object('valida', false, 'motivo', 'vencida', 'correo', v_i.email);
  end if;

  return jsonb_build_object(
    'valida',     true,
    'correo',     v_i.email,
    'ambito',     v_i.ambito,
    'clan',       v_i.clan,
    'santuario',  v_i.santuario,
    'rol',        v_i.team_role,
    'invita',     v_i.invited_by_nombre,
    'mensaje',    v_i.mensaje,
    'tiene_cuenta', exists (select 1 from auth.users u where lower(u.email) = v_i.email));
end;
$$;

grant execute on function public.invitacion_por_token(text) to anon, authenticated;

-- Aplicar lo que la invitación prometía ---------------------------------------
-- Se llama al entrar, sin token: busca por el correo de la sesión. Así la
-- promesa se cumple aunque el enlace haya caducado en la bandeja de entrada.
create or replace function public.aceptar_invitaciones_pendientes()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_correo text;
  v_alma   uuid;
  v_i      public.studio_invitations;
  v_aplicadas int := 0;
  v_clan   text;
  v_sant   text;
begin
  if v_uid is null then
    return jsonb_build_object('aplicadas', 0);
  end if;

  select lower(email) into v_correo from auth.users where id = v_uid;
  select id into v_alma from public.almas where user_id = v_uid;
  if v_alma is null or v_correo is null then
    return jsonb_build_object('aplicadas', 0);
  end if;

  -- De la más antigua a la más nueva: si alguien fue invitado a dos Clanes,
  -- manda la última, que es la que la persona tiene fresca.
  for v_i in
    select * from public.studio_invitations
     where lower(email) = v_correo
       and used_at is null
       and revoked_at is null
       and expires_at > now()
     order by created_at asc
  loop
    update public.almas
       set clan      = coalesce(v_i.clan, clan),
           santuario = coalesce(v_i.santuario, santuario),
           team_role = case when v_i.clan is not null or v_i.santuario is not null
                            then v_i.team_role else team_role end,
           -- El plan sube, nunca baja: entrar a un Clan no puede quitarle el
           -- Santuario a quien ya lo tenía.
           plan      = (select p from unnest(array[
                          coalesce(public.almas.plan, 'ALMA'),
                          case when v_i.plan is not null then v_i.plan
                               when v_i.santuario is not null then 'SANTUARIO'
                               when v_i.clan is not null then 'CLAN'
                               else 'ALMA' end
                        ]) as p
                        order by case p when 'SANTUARIO' then 3 when 'CLAN' then 2 else 1 end desc
                        limit 1)
     where id = v_alma;

    update public.studio_invitations
       set used_at = now(), used_by = v_uid
     where id = v_i.id;

    v_aplicadas := v_aplicadas + 1;
    v_clan := coalesce(v_i.clan, v_clan);
    v_sant := coalesce(v_i.santuario, v_sant);
  end loop;

  return jsonb_build_object('aplicadas', v_aplicadas, 'clan', v_clan, 'santuario', v_sant);
end;
$$;

revoke execute on function public.aceptar_invitaciones_pendientes() from public, anon;
grant  execute on function public.aceptar_invitaciones_pendientes() to authenticated;

-- Lo que necesita la función edge para mandar el correo ------------------------
-- Espejo de `reclamar_invitacion` (migración 0119) para STUDIO. Solo
-- `service_role`: ni el navegador ni una sesión iniciada pueden llamarla.
create or replace function public.preparar_envio_invitacion(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_i public.studio_invitations;
begin
  select * into v_i from public.studio_invitations where id = p_id;

  if v_i.id is null then
    return jsonb_build_object('enviar', false, 'motivo', 'no-existe');
  end if;
  if v_i.used_at is not null or v_i.revoked_at is not null or v_i.expires_at <= now() then
    return jsonb_build_object('enviar', false, 'motivo', 'no-vigente');
  end if;
  if v_i.sent_at is not null and v_i.sent_at > now() - interval '10 minutes' then
    return jsonb_build_object('enviar', false, 'motivo', 'recien-enviado');
  end if;

  update public.studio_invitations set sent_at = now() where id = v_i.id;

  return jsonb_build_object(
    'enviar',   true,
    'correo',   v_i.email,
    'token',    v_i.token,
    'ambito',   v_i.ambito,
    'destino',  coalesce(v_i.santuario, v_i.clan, 'ANIMA STUDIO'),
    'invita',   v_i.invited_by_nombre,
    'tiene_cuenta', exists (select 1 from auth.users u where lower(u.email) = v_i.email));
end;
$$;

revoke execute on function public.preparar_envio_invitacion(uuid) from public, anon, authenticated;
grant  execute on function public.preparar_envio_invitacion(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Los códigos se apagan
-- ---------------------------------------------------------------------------
-- `clan_invites` y `santuario_invites` se quedan con lo que ya tienen —borrar
-- una tabla para ahorrar tres kilobytes es la clase de limpieza que se paga en
-- el peor momento—, pero dejan de generarse y dejan de canjearse. La puerta de
-- los códigos se cierra revocando el permiso de canjearlos: si mañana hay que
-- reabrirla, es un `grant`.
do $$
begin
  if to_regprocedure('public.join_clan_by_code(text)') is not null then
    execute 'revoke execute on function public.join_clan_by_code(text) from public, anon, authenticated';
  end if;
  if to_regprocedure('public.santuario_join_by_code(text)') is not null then
    execute 'revoke execute on function public.santuario_join_by_code(text) from public, anon, authenticated';
  end if;
  if to_regprocedure('public.check_invite(text)') is not null then
    execute 'revoke execute on function public.check_invite(text) from public, anon, authenticated';
  end if;
  if to_regprocedure('public.redeem_invite(text)') is not null then
    execute 'revoke execute on function public.redeem_invite(text) from public, anon, authenticated';
  end if;
end $$;

commit;
