-- ===========================================================
-- 0107 · CAPITAL INTELLIGENCE — el cuestionario de levantamiento
-- -----------------------------------------------------------
-- No se inventa una tabla nueva: `survey_templates`,
-- `survey_sessions` y `survey_answers` existen desde la migración
-- 0063 y hacen exactamente esto —plantilla declarada en jsonb, una
-- sesión por organización con token, respuestas por pregunta—. Lo
-- único que faltaba era la plantilla, y una forma de usarla desde
-- DENTRO de la aplicación, con sesión iniciada, en vez de solo por
-- token público.
--
-- Cada pregunta lleva `why`: para qué sirve la respuesta. Un
-- cuestionario de cuarenta preguntas que no dice para qué pregunta
-- se contesta a desgana en las primeras diez y se abandona en la
-- doce. Diciendo qué configura cada respuesta, quien contesta sabe
-- cuáles puede saltarse y cuáles no.
--
-- `priority: bloqueante` marca lo que hace falta para arrancar. Es
-- una etiqueta honesta, no una validación: nadie tiene que llenar
-- ocho secciones antes de poder mirar la plataforma.
-- ===========================================================

insert into public.survey_templates (slug, name, sector, version, description, definition, active)
values ('capital-intelligence', 'Levantamiento · Capital Intelligence', 'capital', 1,
  'Lo que hay que saber para configurar la plataforma y migrar los proyectos de una firma que analiza inversiones.',
  $json$[
  {
    "key": "A", "short": "A. La firma",
    "title": "A · LA FIRMA Y SU ALCANCE",
    "intro": "Configura la organización, la moneda de consolidación y quién entra a la plataforma.",
    "blocks": [{
      "title": "Identidad y alcance",
      "questions": [
        {"id":"A1","q":"Razón social y el nombre con el que trabajas","why":"Encabeza los informes y da nombre a la organización","example":"Asesorías Andrés SAS / AC Capital","priority":"bloqueante"},
        {"id":"A2","q":"¿Administras proyectos propios o de tus clientes?","why":"Define si la organización es operadora o asesora, y cómo se aíslan los datos","example":"De clientes: cada uno con sus proyectos","priority":"bloqueante"},
        {"id":"A3","q":"Países donde están los proyectos","why":"Alimenta el filtro por país del panel","example":"Colombia, Costa Rica, Chile","priority":"bloqueante"},
        {"id":"A4","q":"¿En qué moneda quieres ver el consolidado?","why":"Es la moneda de la organización: a ella se convierte todo en el panel","example":"USD","priority":"bloqueante"},
        {"id":"A5","q":"¿Cuántos proyectos activos tienes hoy y cuántos quieres migrar para la prueba?","why":"Dimensiona la carga inicial y decide por dónde empezar","example":"11 activos, migrar 3","priority":"alta"}
      ]},
      {"title":"Quién entra",
      "questions":[
        {"id":"A6","q":"Personas que van a usar la plataforma: nombre, correo y qué debería poder hacer cada una","why":"De aquí salen las invitaciones y los roles","example":"Andrés (todo) · analista (carga datos) · socio (solo mira)","priority":"bloqueante"},
        {"id":"A7","q":"¿Vas a dar acceso a algún inversionista o cliente para que vea SU proyecto?","why":"Es el permiso por proyecto: entra a la organización pero solo ve lo autorizado","example":"Sí, dos inversionistas de la ronda semilla","priority":"media"}
      ]}]
  },
  {
    "key": "B", "short": "B. Proyectos",
    "title": "B · PORTAFOLIOS, PROYECTOS Y UNIDADES",
    "intro": "La jerarquía con la que vas a trabajar todos los días.",
    "blocks": [{
      "title": "Cómo agrupas",
      "questions": [
        {"id":"B1","q":"¿Cómo agrupas hoy los proyectos? ¿Por cliente, por vertical, por vehículo?","why":"Define los portafolios","example":"Por cliente","priority":"alta"},
        {"id":"B2","q":"Lista de proyectos a migrar: nombre, tipo, país, moneda y en qué estado está cada uno","why":"Es la carga inicial de la ficha de proyecto","example":"Club de membresía · nueva unidad · CO · USD · en levantamiento","priority":"bloqueante"},
        {"id":"B3","q":"Para cada proyecto: capital requerido y cuánto está captado","why":"Son las cifras de capital del panel","example":"180.000 requeridos, 60.000 captados","priority":"bloqueante"},
        {"id":"B4","q":"¿Qué estados usas para un proyecto, en tus palabras?","why":"Los estados son configurables: si los tuyos no están, se agregan","example":"Evaluación, due diligence, en levantamiento, ejecución","priority":"media"},
        {"id":"B5","q":"¿Qué unidades de negocio tiene cada proyecto? (marcas, locales, canales)","why":"Permite separar el ingreso de cada una sobre una infraestructura compartida","example":"Restaurante, ghost kitchen, eventos","priority":"alta"}
      ]}]
  },
  {
    "key": "C", "short": "C. Modelo",
    "title": "C · EL MODELO FINANCIERO",
    "intro": "Cómo construyes hoy una proyección. Esto define cómo se traduce a la matriz mensual.",
    "blocks": [{
      "title": "Estructura",
      "questions": [
        {"id":"C1","q":"¿En qué construyes hoy las proyecciones y qué te gustaría dejar de hacer a mano?","why":"Marca qué automatizar primero","example":"Excel propio; dejar de recalcular escenarios uno por uno","priority":"alta"},
        {"id":"C2","q":"Horizonte típico de evaluación y si trabajas mensual o anual","why":"Fija el largo del modelo. La plataforma es mensual y agrega a año","example":"36 meses, mensual","priority":"bloqueante"},
        {"id":"C3","q":"Fuentes de ingreso típicas y cómo las calculas: ¿cantidad × precio, monto fijo, o % de otra cosa?","why":"Son los tres motores de línea que existen; cada ingreso usa uno","example":"Membresías: miembros × cuota. Comisión: 4% de los ingresos","priority":"bloqueante"},
        {"id":"C4","q":"Costos directos que sigues","why":"Definen el margen bruto","example":"Costo por miembro, comisión de pasarela, food cost","priority":"alta"},
        {"id":"C5","q":"Gastos operativos fijos","why":"Sin ellos el EBITDA que muestra una proyección es en realidad el margen bruto","example":"Personal, arriendo, administración, marketing, tecnología","priority":"bloqueante"},
        {"id":"C6","q":"Partidas de inversión (CAPEX, capital de trabajo, marca, tecnología)","why":"Alimentan el flujo y el payback","example":"Desarrollo 60.000, marca 25.000","priority":"alta"}
      ]},
      {"title":"Parámetros",
      "questions":[
        {"id":"C7","q":"¿Declaras el saldo inicial de caja de cada proyecto?","why":"Sin él la necesidad de capital sale mal y el modelo no se puede validar","example":"Sí, lo que queda del primer tramo","priority":"bloqueante"},
        {"id":"C8","q":"Tasa de descuento que usas para el VAN y por qué esa","why":"Sin tasa no hay VAN, y una valoración sin VAN detrás no tiene metodología","example":"18% anual, costo de capital del fondo","priority":"bloqueante"},
        {"id":"C9","q":"Tasa de impuesto que aplicas","why":"Separa el flujo operativo del resultado","example":"30%","priority":"alta"},
        {"id":"C10","q":"¿Modelas depreciación? ¿cómo?","why":"Con CAPEX y sin depreciación, el EBIT es igual al EBITDA y el proyecto se ve mejor de lo que es","example":"Lineal a 5 años","priority":"media"}
      ]}]
  },
  {
    "key": "D", "short": "D. Escenarios",
    "title": "D · ESCENARIOS Y VERSIONES",
    "intro": "Cómo comparas alternativas y cómo guardas lo que ya mostraste.",
    "blocks": [{
      "title": "Escenarios",
      "questions": [
        {"id":"D1","q":"¿Trabajas con escenarios? ¿cuáles y cómo los llamas?","why":"Cada escenario es un juego de supuestos comparable","example":"Conservador, base, optimista","priority":"alta"},
        {"id":"D2","q":"¿Qué palancas cambias entre un escenario y otro?","why":"Son los supuestos que quedan declarados y comparables","example":"Volumen, precio, churn, fecha de lanzamiento","priority":"alta"},
        {"id":"D3","q":"¿Cómo guardas hoy la versión que le mostraste a un inversionista?","why":"En la plataforma validar congela la versión; hay que saber qué costumbre reemplaza","example":"Copio el Excel con la fecha en el nombre","priority":"media"},
        {"id":"D4","q":"¿Quién aprueba que un modelo esté listo para mostrarse?","why":"Define quién puede marcar validado","example":"Yo, y en proyectos grandes el socio","priority":"media"}
      ]}]
  },
  {
    "key": "E", "short": "E. Ejecución",
    "title": "E · PRESUPUESTO CONTRA EJECUCIÓN REAL",
    "intro": "De dónde sale el dato real y contra qué se compara.",
    "blocks": [{
      "title": "Seguimiento",
      "questions": [
        {"id":"E1","q":"¿Llevas hoy ejecución real contra presupuesto? ¿con qué frecuencia?","why":"Define si hay historia que migrar o se empieza desde el mes en curso","example":"Mensual, en una planilla aparte","priority":"alta"},
        {"id":"E2","q":"¿De dónde sale el dato real: contabilidad, banco, planilla del operador?","why":"Marca si se puede importar o hay que cargarlo a mano","example":"Del contador, en Excel","priority":"alta"},
        {"id":"E3","q":"Categorías de costo y gasto que usas","why":"Presupuesto y real se comparan por categoría: si no coinciden, no hay comparación","example":"Personal, arriendo, insumos, marketing","priority":"bloqueante"},
        {"id":"E4","q":"¿Distingues lo comprometido de lo pagado?","why":"Es donde un proyecto descubre en octubre que ya gastó diciembre","example":"Sí, órdenes de compra aparte","priority":"alta"},
        {"id":"E5","q":"¿Desde qué desviación te preocupas, y desde cuál es grave?","why":"Configura los umbrales del semáforo de esta organización","example":"Aviso 8%, crítico 15%","priority":"media"}
      ]}]
  },
  {
    "key": "F", "short": "F. Capital",
    "title": "F · CAPITAL E INVERSIONISTAS",
    "intro": "Prepara la Fase 2. No bloquea la prueba, pero define qué se construye después.",
    "blocks": [{
      "title": "Rondas",
      "questions": [
        {"id":"F1","q":"Rondas abiertas hoy: monto objetivo, fecha de cierre y cuánto está comprometido","why":"Es la ficha de ronda de la Fase 2","example":"Semilla, 500.000, cierre enero, 325.000 comprometidos","priority":"media"},
        {"id":"F2","q":"Instrumentos que usas","why":"Define cómo se registra el compromiso y cómo diluye","example":"SAFE post-money, equity directo","priority":"media"},
        {"id":"F3","q":"¿Llevas cap table? ¿dónde?","why":"Base para simular dilución antes de confirmar una ronda","example":"Excel del abogado","priority":"media"},
        {"id":"F4","q":"Pipeline de inversionistas: cuántos y en qué etapas los clasificas","why":"Son las columnas del CRM de inversionistas","example":"~30; contactado, reunión, DD, comprometido","priority":"media"},
        {"id":"F5","q":"¿En qué categorías divides el uso de fondos?","why":"La suma tiene que cuadrar con el monto de la ronda","example":"CAPEX, marketing, capital de trabajo, reservas","priority":"media"}
      ]}]
  },
  {
    "key": "G", "short": "G. Monedas",
    "title": "G · MULTIMONEDA",
    "intro": "Sin tipo de cambio, un proyecto en otra moneda no entra en el consolidado.",
    "blocks": [{
      "title": "Tipos de cambio",
      "questions": [
        {"id":"G1","q":"Monedas en juego entre tus proyectos","why":"Define qué pares de conversión hay que cargar","example":"COP, USD, CRC, CLP","priority":"bloqueante"},
        {"id":"G2","q":"¿De dónde sacas el tipo de cambio y con qué frecuencia lo actualizas?","why":"Determina si se carga a mano o conviene automatizarlo más adelante","example":"TRM oficial, mensual","priority":"alta"},
        {"id":"G3","q":"¿Usas la tasa del día del movimiento o una tasa fija del período?","why":"El valor convertido se guarda y no se recalcula: hay que saber cuál guardar","example":"Tasa de cierre de mes","priority":"alta"}
      ]}]
  },
  {
    "key": "H", "short": "H. La prueba",
    "title": "H · CÓMO SERÁ LA PRUEBA",
    "intro": "Qué tiene que pasar para que esto valga la pena.",
    "blocks": [{
      "title": "Alcance y éxito",
      "questions": [
        {"id":"H1","q":"¿Con qué proyecto quieres empezar y por qué ese?","why":"El primero define el orden de la migración","example":"El de la ronda abierta: es el que estoy mostrando","priority":"bloqueante"},
        {"id":"H2","q":"¿Qué tendría que pasar en cuatro semanas para que digas que funcionó?","why":"Es el criterio con el que se evalúa la prueba","example":"Armar un escenario nuevo en una hora en vez de un día","priority":"alta"},
        {"id":"H3","q":"¿Qué haces hoy que NO quieres que la plataforma te obligue a seguir haciendo?","why":"Suele señalar la mitad del valor del proyecto","example":"Rehacer el deck cada vez que cambia un supuesto","priority":"alta"},
        {"id":"H4","q":"Fecha en la que quieres estar operando con esto","why":"Ordena las fases","example":"Primera semana de octubre","priority":"media"}
      ]}]
  }
]$json$::jsonb, true)
on conflict (slug) do update
   set name = excluded.name, sector = excluded.sector, description = excluded.description,
       definition = excluded.definition, active = true;

-- La sesión de levantamiento de una organización, desde dentro de la
-- aplicación. Existe una por organización y plantilla; se crea sola
-- la primera vez que un administrador abre la pestaña.
create or replace function public.ci_levantamiento(p_company uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tpl record; v_ses record; v_total int; v_resp int;
begin
  if not public.has_company_level(p_company, 40) then return '{}'::jsonb; end if;

  select * into v_tpl from public.survey_templates where slug = 'capital-intelligence' and active;
  if v_tpl is null then return '{}'::jsonb; end if;

  select * into v_ses from public.survey_sessions
   where company_id = p_company and template_id = v_tpl.id limit 1;

  if v_ses is null and public.has_company_level(p_company, 60) then
    insert into public.survey_sessions
      (company_id, template_id, token, business_name, status, created_by)
    select p_company, v_tpl.id,
           replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
           c.name, 'abierta', (select auth.uid())
      from public.companies c where c.id = p_company
    returning * into v_ses;
  end if;
  if v_ses is null then return '{}'::jsonb; end if;

  select count(*) into v_total
    from jsonb_array_elements(v_tpl.definition) s,
         jsonb_array_elements(s->'blocks') b,
         jsonb_array_elements(b->'questions') q;

  select count(*) into v_resp from public.survey_answers a
   where a.session_id = v_ses.id and coalesce(btrim(a.answer), '') <> '';

  return jsonb_build_object(
    'sesion', jsonb_build_object('id', v_ses.id, 'estado', v_ses.status,
                'enviado_en', v_ses.submitted_at, 'aplicado_en', v_ses.applied_at,
                'actividad', v_ses.last_activity_at),
    'plantilla', jsonb_build_object('nombre', v_tpl.name, 'descripcion', v_tpl.description,
                   'secciones', v_tpl.definition),
    'respuestas', coalesce((select jsonb_object_agg(a.question_id, a.answer)
                              from public.survey_answers a where a.session_id = v_ses.id), '{}'::jsonb),
    'avance', jsonb_build_object('respondidas', v_resp, 'total', v_total,
                'pct', case when v_total > 0 then round(v_resp::numeric / v_total * 100) else 0 end));
end $$;
revoke execute on function public.ci_levantamiento(uuid) from public, anon;
grant  execute on function public.ci_levantamiento(uuid) to authenticated;

create or replace function public.ci_responder(p_company uuid, p_pregunta text, p_respuesta text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ses uuid;
begin
  if not public.has_company_level(p_company, 60) then
    raise exception 'No tienes permiso para responder el levantamiento de esta organización';
  end if;

  select s.id into v_ses from public.survey_sessions s
    join public.survey_templates t on t.id = s.template_id and t.slug = 'capital-intelligence'
   where s.company_id = p_company limit 1;
  if v_ses is null then raise exception 'El levantamiento no está iniciado'; end if;

  insert into public.survey_answers (session_id, question_id, answer)
  values (v_ses, p_pregunta, p_respuesta)
  on conflict (session_id, question_id) do update
     set answer = excluded.answer, updated_at = now();

  update public.survey_sessions set last_activity_at = now() where id = v_ses;
end $$;
revoke execute on function public.ci_responder(uuid, text, text) from public, anon;
grant  execute on function public.ci_responder(uuid, text, text) to authenticated;

create or replace function public.ci_cerrar_levantamiento(p_company uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ses uuid;
begin
  if not public.has_company_level(p_company, 60) then
    raise exception 'No tienes permiso';
  end if;
  select s.id into v_ses from public.survey_sessions s
    join public.survey_templates t on t.id = s.template_id and t.slug = 'capital-intelligence'
   where s.company_id = p_company limit 1;
  if v_ses is null then raise exception 'El levantamiento no está iniciado'; end if;

  update public.survey_sessions
     set status = 'enviada', submitted_at = coalesce(submitted_at, now()), last_activity_at = now()
   where id = v_ses;

  return public.ci_levantamiento(p_company);
end $$;
revoke execute on function public.ci_cerrar_levantamiento(uuid) from public, anon;
grant  execute on function public.ci_cerrar_levantamiento(uuid) to authenticated;
