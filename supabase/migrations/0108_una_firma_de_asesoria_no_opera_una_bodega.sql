-- ===========================================================
-- 0108 · Una firma de asesoría no opera una bodega
-- -----------------------------------------------------------
-- Dos operaciones y una sección más del cuestionario.
--
-- El perfil de asesoría: una organización `advisor` administra los
-- proyectos de SUS CLIENTES —analiza, modela, levanta capital—. No
-- vende, no despacha, no lleva inventario. Encenderle Ventas, Reparto
-- y Cocina no le da opciones, le da ruido: seis entradas de menú que
-- nunca va a abrir y que le hacen buscar dos veces la que sí usa.
--
-- El alta de firma: siete pasos que tienen que ocurrir juntos o no
-- ocurrir. Sin suscripción no hay plan, sin plan no hay módulos, sin
-- módulos no hay menú, y sin invitación la persona no puede entrar.
-- Media organización creada es peor que ninguna, porque se descubre
-- tarde y desde dentro.
-- ===========================================================

create or replace function public.ci_perfil_asesoria(p_company uuid)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n int;
begin
  if not (public.is_platform_admin() or public.has_company_level(p_company, 80)) then
    raise exception 'No tienes permiso para configurar esta organización';
  end if;

  insert into public.company_modules (company_id, module_id, enabled)
  select p_company, m.id, m.slug in ('core', 'capital', 'support')
    from public.modules m
  on conflict (company_id, module_id) do update
     set enabled = excluded.enabled, updated_at = now();

  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.ci_perfil_asesoria(uuid) from public, anon;
grant  execute on function public.ci_perfil_asesoria(uuid) to authenticated;

comment on function public.ci_perfil_asesoria(uuid) is
  'Deja encendidos solo Core, Capital Intelligence y Soporte. Es el espacio de una firma que analiza proyectos, no de una que opera. El plan Enterprise sigue incluyendo todo: esto decide con qué llega el día uno, y desde Configuración se enciende lo que se quiera.';

-- Quien ejecuta el alta queda dentro como propietario —hace falta para
-- configurarla y para acompañar— y la persona invitada también. Dos
-- propietarios es lo correcto mientras dura la puesta en marcha.
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
  v_req int; v_existe uuid;
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
  select id into v_rol   from public.roles where slug = 'owner';

  insert into public.companies (name, slug, status, country, currency, timezone, locale,
                                product_line_id, tenant_type, created_by)
  values (p_nombre, p_slug, 'active', p_pais, p_moneda, p_zona, 'es', v_linea, 'advisor', v_yo)
  returning id into v_emp;

  insert into public.subscriptions (company_id, plan_id, status, price_amount, currency, billing_cycle)
  values (v_emp, v_plan, 'prueba', 0, p_moneda, 'mensual');

  perform public.ci_perfil_asesoria(v_emp);

  -- Los umbrales del semáforo arrancan en 10/20, que es lo razonable
  -- mientras nadie diga otra cosa. La pregunta E5 del levantamiento
  -- existe justamente para reemplazarlos por los suyos.
  insert into public.ci_thresholds (company_id, kind, warn_pct, critical_pct)
  values (v_emp, 'general', 10, 20)
  on conflict (company_id, kind) do nothing;

  v_req := public.ci_sembrar_requisitos(v_emp);
  perform public.ci_levantamiento(v_emp);   -- abre la sesión del cuestionario

  insert into public.user_invitations (company_id, email, full_name, role_id, invited_by, notes)
  values (v_emp, lower(btrim(p_email)), p_persona, v_rol, v_yo,
          'Alta de la firma. Entra con este correo y queda dentro como propietario.');

  return jsonb_build_object(
    'empresa', v_emp, 'slug', p_slug, 'invitado', lower(btrim(p_email)),
    'requisitos', v_req,
    'modulos', (select coalesce(jsonb_agg(m.slug order by m.sort), '[]'::jsonb)
                  from public.company_modules cm join public.modules m on m.id = cm.module_id
                 where cm.company_id = v_emp and cm.enabled));
end $$;
revoke execute on function public.ci_crear_firma(text,text,text,text,text,text,text) from public, anon;
grant  execute on function public.ci_crear_firma(text,text,text,text,text,text,text) to authenticated;

-- El cuestionario gana una sección: qué falta por construir.
--
-- Las ocho que había preguntan cómo trabaja HOY, que es lo que hace
-- falta para configurar la plataforma. Esta pregunta por lo otro: qué
-- necesita que exista y todavía no existe. Es lo que ordena las Fases
-- 2 y 3 según su caso y no según lo que a nosotros nos parezca.
update public.survey_templates
   set definition = definition || $j$[{
  "key": "I", "short": "I. Qué falta",
  "title": "I · QUÉ FALTA POR CONSTRUIR",
  "intro": "Las secciones anteriores preguntan cómo trabajas hoy. Esta pregunta por lo que necesitas que exista y todavía no existe: es lo que decide qué se construye después y en qué orden.",
  "blocks": [{
    "title": "Lo que hoy haces a mano",
    "questions": [
      {"id":"I1","q":"¿Qué parte de tu trabajo te gustaría que la plataforma hiciera y hoy no hace?","why":"Es la lista de la que sale el próximo desarrollo","example":"Armar el resumen de la ronda para mandarlo","priority":"alta"},
      {"id":"I2","q":"¿Qué te piden tus clientes que hoy armas a mano cada vez?","why":"Lo que se repite es lo primero que conviene automatizar","example":"Un informe mensual por proyecto","priority":"alta"},
      {"id":"I3","q":"¿Qué informes tienes que entregar, a quién y con qué frecuencia?","why":"Define qué reportes se construyen y en qué formato salen","example":"Directorio mensual; inversionistas trimestral","priority":"alta"}
    ]},
    {"title": "El orden de lo que viene",
    "questions": [
      {"id":"I4","q":"De lo que está diseñado y sin construir —rondas, CRM de inversionistas, cap table con dilución, due diligence y data room, importar desde Excel— ¿en qué orden lo pondrías tú?","why":"Ordena las Fases 2 y 3 según tu caso y no según lo que nos parezca","example":"1 rondas, 2 importar Excel, 3 cap table","priority":"bloqueante"},
      {"id":"I5","q":"¿Qué tendría que hacer la plataforma para que dejaras de abrir el Excel del todo?","why":"Es el criterio de terminado. Sin él, siempre falta algo indefinido","example":"Que pueda editar una celda del modelo sin recalcular todo","priority":"alta"},
      {"id":"I6","q":"¿Hay algo que NO quieras que la plataforma haga?","why":"Un límite dicho a tiempo ahorra construir lo que después hay que quitar","example":"Que no mande correos a inversionistas por su cuenta","priority":"media"}
    ]}]
}]$j$::jsonb
 where slug = 'capital-intelligence';
