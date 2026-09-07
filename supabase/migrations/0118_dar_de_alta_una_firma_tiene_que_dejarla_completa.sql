-- Dar de alta una firma tiene que dejarla completa
-- ---------------------------------------------------------------------------
-- `ci_crear_firma()` prometía dos cosas que no cumplía. Se descubrieron al
-- montar la primera firma real: hubo que reparar a mano lo que el alta debía
-- haber dejado hecho.
--
-- 1 · EL COMENTARIO DECÍA «quien ejecuta el alta queda dentro como
--     propietario» y el código no insertaba esa membresía. Solo creaba la
--     invitación de la persona invitada. Quien daba de alta la organización
--     se quedaba fuera de ella.
--
-- 2 · `ci_levantamiento()` NO ABRÍA LA SESIÓN DEL CUESTIONARIO, y además
--     fallaba callado. Esa función crea la sesión solo si quien llama tiene
--     nivel 60 en la empresa —cosa correcta: la abre una persona, no un
--     proceso—. Pero como el alta no dejaba dentro a nadie, no había nadie
--     con nivel 60 y la condición nunca se cumplía. Devolvía `{}` sin error,
--     así que el alta se veía exitosa y el cuestionario no existía.
--
-- Las dos tienen la misma causa y la misma cura: insertar la membresía ANTES
-- de llamar al levantamiento. El orden es la corrección, no un detalle.
--
-- De paso, la sesión toma el nombre de la persona invitada. `client_name`
-- es `not null default 'Cliente'` (migración 0045), así que sin esto la
-- primera pantalla que ve alguien en su propia organización lo saluda como
-- «Cliente».
--
-- `ci_levantamiento()` no se toca: su guardia está bien puesta.

create or replace function public.ci_crear_firma(
  p_nombre text,
  p_slug   text,
  p_email  text,
  p_persona text default null,
  p_pais   text default 'CO',
  p_moneda text default 'USD',
  p_zona   text default 'America/Bogota')
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_emp uuid; v_linea uuid; v_plan uuid; v_rol uuid; v_yo uuid := (select auth.uid());
  v_req int; v_existe uuid; v_ses uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'Solo la Consola de ANIMA da de alta organizaciones';
  end if;
  if p_email is null or position('@' in p_email) = 0 then
    raise exception 'Hace falta un correo válido para invitar a quien va a usarla';
  end if;

  select id into v_existe from public.companies where slug = p_slug;
  if v_existe is not null then
    raise exception 'Ya existe una organización con el identificador «%»', p_slug;
  end if;

  select id into v_linea from public.product_lines where slug = 'company';
  select id into v_plan  from public.plans where slug = 'enterprise' and product_line_id = v_linea;
  select id into v_rol   from public.roles where slug = 'owner' and scope = 'company';

  insert into public.companies (name, slug, status, country, currency, timezone, locale,
                                product_line_id, tenant_type, created_by)
  values (p_nombre, p_slug, 'active', p_pais, p_moneda, p_zona, 'es', v_linea, 'advisor', v_yo)
  returning id into v_emp;

  insert into public.subscriptions (company_id, plan_id, status, price_amount, currency, billing_cycle)
  values (v_emp, v_plan, 'prueba', 0, p_moneda, 'mensual');

  -- Esto es lo que faltaba. Va aquí y no al final porque `ci_levantamiento()`
  -- de más abajo pregunta por el nivel de quien llama.
  insert into public.company_members (company_id, user_id, role_id, status)
  values (v_emp, v_yo, v_rol, 'active')
  on conflict do nothing;

  perform public.ci_perfil_asesoria(v_emp);

  -- Los umbrales del semáforo arrancan en 10/20, que es lo razonable
  -- mientras nadie diga otra cosa. La pregunta E5 del levantamiento
  -- existe justamente para reemplazarlos por los suyos.
  insert into public.ci_thresholds (company_id, kind, warn_pct, critical_pct)
  values (v_emp, 'general', 10, 20)
  on conflict (company_id, kind) do nothing;

  v_req := public.ci_sembrar_requisitos(v_emp);
  perform public.ci_levantamiento(v_emp);   -- abre la sesión del cuestionario

  -- Ahora sí tiene que existir. Si no existe es un fallo del alta, no un
  -- detalle que se pueda dejar pasar: la firma nacería sin cuestionario y
  -- nadie se enteraría hasta abrir la pestaña.
  select id into v_ses from public.survey_sessions s
   where s.company_id = v_emp
     and s.template_id = (select id from public.survey_templates
                           where slug = 'capital-intelligence' and active)
   limit 1;
  if v_ses is null then
    raise exception 'El alta no pudo abrir el cuestionario de levantamiento';
  end if;
  if coalesce(btrim(p_persona), '') <> '' then
    update public.survey_sessions set client_name = btrim(p_persona) where id = v_ses;
  end if;

  insert into public.user_invitations (company_id, email, full_name, role_id, invited_by, notes)
  values (v_emp, lower(btrim(p_email)), p_persona, v_rol, v_yo,
          'Alta de la firma. Entra con este correo y queda dentro como propietario.');

  return jsonb_build_object(
    'empresa', v_emp, 'slug', p_slug, 'invitado', lower(btrim(p_email)),
    'requisitos', v_req, 'cuestionario', v_ses,
    'modulos', (select coalesce(jsonb_agg(m.slug order by m.sort), '[]'::jsonb)
                  from public.company_modules cm join public.modules m on m.id = cm.module_id
                 where cm.company_id = v_emp and cm.enabled));
end $$;
revoke execute on function public.ci_crear_firma(text,text,text,text,text,text,text) from public, anon;
grant  execute on function public.ci_crear_firma(text,text,text,text,text,text,text) to authenticated;
