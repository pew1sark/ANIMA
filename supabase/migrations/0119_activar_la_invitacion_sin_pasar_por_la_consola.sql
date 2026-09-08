-- Activar la invitación sin pasar por la consola
-- ---------------------------------------------------------------------------
-- Una invitación en `user_invitations` da organización y rol, pero NO da
-- cuenta: en Supabase el usuario de `auth.users` lo crea la API de
-- administración, que exige la clave `service_role`. Hasta ahora eso obligaba
-- a entrar al panel de Supabase por cada persona invitada. Con dos clientes
-- da igual; con veinte es un cuello de botella con nombre y apellido.
--
-- Esta migración pone la REGLA en la base. Quien la ejecuta es la función
-- edge `activar-invitacion`, que sí tiene `service_role` y es lo único que
-- puede llamarla. La función edge no decide nada: pregunta aquí.
--
-- Tres cosas que esta función hace y que conviene no perder de vista:
--
-- 1 · NO ES UN RELÉ DE CORREO. Solo responde «enviar» cuando ya existe una
--     invitación pendiente para esa dirección. Escribir el correo de un
--     desconocido no manda nada a ninguna parte.
--
-- 2 · MARCA EL ENVÍO EN LA MISMA LLAMADA. `invite_sent_at` se escribe aquí y
--     no en la función edge, así que dos peticiones simultáneas no pueden
--     mandar dos correos: la segunda ya ve la marca de la primera. La ventana
--     es de 10 minutos, que es más o menos lo que tarda alguien en revisar la
--     bandeja antes de volver a pulsar.
--
-- 3 · DICE SI YA HAY CUENTA. No es lo mismo estrenar («te invitamos») que
--     volver («recupera tu contraseña»), y solo `auth.users` lo sabe. Esta
--     función es SECURITY DEFINER justamente para poder mirarlo; nadie más
--     puede.
--
-- Lo que NO hace: contestar distinto según el caso hacia fuera. Eso lo
-- resuelve la función edge, devolviendo siempre lo mismo. Si respondiera
-- «no tienes invitación» estaría diciéndole a cualquiera quién sí la tiene.

alter table public.user_invitations
  add column if not exists invite_sent_at timestamptz;

comment on column public.user_invitations.invite_sent_at is
  'Cuándo se mandó por última vez el correo de activación. Frena los reenvíos.';

create or replace function public.reclamar_invitacion(p_email text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_correo text := lower(btrim(coalesce(p_email, '')));
  v_inv    record;
begin
  if position('@' in v_correo) = 0 then
    return jsonb_build_object('enviar', false, 'motivo', 'correo-invalido');
  end if;

  -- La más reciente: si alguien fue invitado dos veces, manda la última.
  select i.id, i.company_id, i.invite_sent_at, c.name as empresa
    into v_inv
    from public.user_invitations i
    join public.companies c on c.id = i.company_id
   where lower(i.email) = v_correo
     and i.used_at is null
     and i.expires_at > now()
   order by i.created_at desc
   limit 1;

  if v_inv is null then
    return jsonb_build_object('enviar', false, 'motivo', 'sin-invitacion');
  end if;

  if v_inv.invite_sent_at is not null
     and v_inv.invite_sent_at > now() - interval '10 minutes' then
    return jsonb_build_object('enviar', false, 'motivo', 'recien-enviado');
  end if;

  update public.user_invitations set invite_sent_at = now() where id = v_inv.id;

  return jsonb_build_object(
    'enviar', true,
    'correo', v_correo,
    'empresa', v_inv.empresa,
    -- Estrenar cuenta y recuperarla son dos correos distintos.
    'tiene_cuenta', exists (select 1 from auth.users u where lower(u.email) = v_correo));
end $$;

-- Solo la función edge. Ni el navegador ni una sesión iniciada pueden
-- llamarla: `service_role` es la única llave.
revoke execute on function public.reclamar_invitacion(text) from public, anon, authenticated;
grant  execute on function public.reclamar_invitacion(text) to service_role;
