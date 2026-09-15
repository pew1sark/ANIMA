-- ===========================================================
-- 0131 · BROKERAGE — el panel comercial
-- -----------------------------------------------------------
-- Una sola función para toda la pantalla, igual que `rei_resumen()` y
-- por el mismo motivo: si la comisión del mes se calculara en el
-- panel, en el informe y en la pantalla de metas, tarde o temprano
-- darían tres cifras distintas y no habría forma de saber cuál está
-- mal. Se calcula UNA vez, aquí.
--
-- La pantalla se lee en el orden en que se pregunta:
--
--   1 · qué está torcido        las alertas
--   2 · cómo va el mes          comisión contra meta, y la brecha
--   3 · de dónde va a salir     el embudo y el pipeline ponderado
--   4 · quién                   el equipo, cada uno contra su meta
--   5 · qué hay que hacer       la semana y lo que no tiene próxima acción
--   6 · qué se vence            los contratos, por tramos
--
-- DOS COSAS QUE NO HACE, a propósito:
--
--   · No inventa el mes de lo que no tiene fecha. Una negociación
--     ganada sin `closed_at` no entra en la comisión del tramo. El
--     trigger de 0129 la pone sola, así que solo puede faltar en
--     filas migradas a mano — y esas se avisan, no se reparten.
--
--   · No mezcla comisión realizada con forecast. Son dos cifras y se
--     muestran separadas: sumarlas produce un número que no es ni lo
--     que entró ni lo que va a entrar, y es el número que después
--     alguien lleva a una reunión.
-- ===========================================================

create or replace function public.rei_comercial(p_company uuid, p_filtros jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_moneda text; v_desde date; v_hasta date; v_ini date; v_fin date;
  v_ciudad text; v_broker uuid;
  v_cifras jsonb; v_series jsonb; v_listas jsonb; v_alertas jsonb := '[]'::jsonb;
  v_embudo jsonb;

  v_leads int; v_abiertos int; v_ganados int; v_perdidos int;
  v_captaciones int; v_inventario int; v_visitas int; v_agendadas int;
  v_cierres int; v_comision numeric; v_forecast numeric;
  v_meta numeric; v_meta_cierres numeric;
  v_dias_cierre numeric; v_dias_contacto numeric;
  v_sin_accion int; v_sin_contactar int; v_detenidas int;
  v_vencen int; v_vencen_monto numeric; v_tareas_vencidas int; v_estancados int;
  v_u_contacto numeric; v_u_detenido numeric; v_u_estancado numeric; v_u_aviso numeric;
begin
  -- El mismo umbral que el resto del módulo: nivel 40 para mirar.
  if not public.has_company_level(p_company, 40) then return '{}'::jsonb; end if;

  select currency into v_moneda from public.companies where id = p_company;

  -- Por defecto, EL MES EN CURSO. El panel de desarrollo mira dos
  -- años porque una prefactibilidad se cocina en trimestres; una
  -- oficina comercial se mide en meses y la pregunta del día es cómo
  -- va este.
  v_desde  := coalesce((p_filtros->>'desde')::date, date_trunc('month', current_date)::date);
  v_hasta  := coalesce((p_filtros->>'hasta')::date, date_trunc('month', current_date)::date);
  v_ini    := date_trunc('month', v_desde)::date;
  v_fin    := (date_trunc('month', v_hasta) + interval '1 month' - interval '1 day')::date;
  v_ciudad := nullif(p_filtros->>'ciudad', '');
  v_broker := nullif(p_filtros->>'broker', '')::uuid;

  v_u_contacto  := public.rei_parametro(p_company, 'dias_primer_contacto',     1);
  v_u_detenido  := public.rei_parametro(p_company, 'dias_deal_detenido',      14);
  v_u_estancado := public.rei_parametro(p_company, 'dias_inmueble_estancado', 60);
  v_u_aviso     := public.rei_parametro(p_company, 'dias_aviso_vencimiento',  60);

  -- ---------- leads ----------
  select count(*) filter (where created_at >= v_ini and created_at < v_fin + 1),
         count(*) filter (where stage not in ('ganado','perdido')),
         count(*) filter (where stage = 'ganado'  and won_at  >= v_ini and won_at  < v_fin + 1),
         count(*) filter (where stage = 'perdido' and lost_at >= v_ini and lost_at < v_fin + 1),
         count(*) filter (where stage not in ('ganado','perdido') and next_action_date is null),
         count(*) filter (where stage = 'nuevo'
                            and created_at < now() - make_interval(days => v_u_contacto::int)),
         avg(extract(epoch from (first_contact_at - created_at)) / 86400)
           filter (where first_contact_at is not null)
    into v_leads, v_abiertos, v_ganados, v_perdidos, v_sin_accion, v_sin_contactar, v_dias_contacto
    from public.rei_leads
   where company_id = p_company and deleted_at is null
     and (v_ciudad is null or city      = v_ciudad)
     and (v_broker is null or broker_id = v_broker);

  -- ---------- inventario y captación ----------
  select count(*) filter (where entry_date between v_ini and v_fin),
         count(*) filter (where lower(commercial_status) = 'disponible')
    into v_captaciones, v_inventario
    from public.rei_properties
   where company_id = p_company and deleted_at is null
     and (v_ciudad is null or city = v_ciudad);

  -- ---------- visitas ----------
  -- La visita no lleva ciudad: la hereda del inmueble, que es donde
  -- de verdad vive. Duplicarla en la visita habría creado dos
  -- verdades para el mismo dato.
  select count(*) filter (where v.status = 'realizada' and v.done_at >= v_ini and v.done_at < v_fin + 1),
         count(*) filter (where v.status in ('agendada','confirmada')
                            and v.scheduled_at >= now())
    into v_visitas, v_agendadas
    from public.rei_visits v
    left join public.rei_properties pr on pr.id = v.property_id
   where v.company_id = p_company and v.deleted_at is null
     and (v_ciudad is null or pr.city    = v_ciudad)
     and (v_broker is null or v.broker_id = v_broker);

  -- ---------- negociaciones ----------
  select count(*) filter (where stage = 'ganado' and closed_at >= v_ini and closed_at < v_fin + 1),
         coalesce(sum(expected_revenue) filter (where stage = 'ganado'
                                                  and closed_at >= v_ini and closed_at < v_fin + 1), 0),
         coalesce(sum(weighted_revenue) filter (where stage not in ('ganado','perdido')), 0),
         count(*) filter (where stage not in ('ganado','perdido')
                            and updated_at < now() - make_interval(days => v_u_detenido::int)),
         avg(extract(epoch from (closed_at - created_at)) / 86400)
           filter (where stage = 'ganado' and closed_at is not null)
    into v_cierres, v_comision, v_forecast, v_detenidas, v_dias_cierre
    from public.rei_deals
   where company_id = p_company and deleted_at is null
     and (v_ciudad is null or city      = v_ciudad)
     and (v_broker is null or broker_id = v_broker);

  v_sin_accion := v_sin_accion + (
    select count(*) from public.rei_deals
     where company_id = p_company and deleted_at is null
       and stage not in ('ganado','perdido') and next_action_date is null
       and (v_ciudad is null or city      = v_ciudad)
       and (v_broker is null or broker_id = v_broker));

  -- ---------- la meta del tramo ----------
  -- Una meta por mes: en un rango de varios meses se SUMAN. Sin
  -- persona en el filtro se toman todas las metas del tramo —las de
  -- cada corredor más las de la oficina— y con persona, solo la suya.
  select coalesce(sum(target_value) filter (where metric = 'comision'), 0),
         coalesce(sum(target_value) filter (where metric = 'cierres'), 0)
    into v_meta, v_meta_cierres
    from public.rei_targets
   where company_id = p_company and deleted_at is null
     and period_month between v_ini and v_fin
     and (v_ciudad is null or city is null or city = v_ciudad)
     and (v_broker is null or user_id = v_broker);

  -- ---------- contratos que vencen ----------
  select count(*), coalesce(sum(monthly_amount), 0)
    into v_vencen, v_vencen_monto
    from public.rei_contracts
   where company_id = p_company and deleted_at is null
     and status in ('vigente','renovado')
     and end_date is not null
     and end_date between current_date and current_date + make_interval(days => v_u_aviso::int)
     and (v_ciudad is null or city      = v_ciudad)
     and (v_broker is null or broker_id = v_broker);

  -- ---------- pendientes vencidos ----------
  select count(*) into v_tareas_vencidas
    from public.rei_activities
   where company_id = p_company and deleted_at is null
     and due_date is not null and done_at is null and due_date < current_date
     and (v_broker is null or owner_id = v_broker);

  -- ---------- inmuebles sin una sola visita ----------
  select count(*) into v_estancados
    from public.rei_properties p
   where p.company_id = p_company and p.deleted_at is null
     and lower(p.commercial_status) = 'disponible'
     and p.entry_date is not null
     and p.entry_date < current_date - make_interval(days => v_u_estancado::int)
     and (v_ciudad is null or p.city = v_ciudad)
     and not exists (select 1 from public.rei_visits v
                      where v.property_id = p.id and v.deleted_at is null
                        and v.status = 'realizada');

  -- ===================== LAS CIFRAS =====================
  -- Cada una con su fórmula y sus insumos pegados, como en CI: una
  -- cifra que no se puede abrir es una cifra que nadie discute y que
  -- por eso nadie cree.
  v_cifras := jsonb_build_array(
    public.ci_indicador('comision', 'Comisión del tramo', v_comision, 'dinero',
      'Suma del ingreso esperado de las negociaciones GANADAS con fecha de cierre dentro del tramo. El ingreso esperado de cada una es la comisión pactada, o valor × porcentaje.',
      jsonb_build_array(
        public.ci_insumo('Negociaciones ganadas', v_cierres, 'numero'),
        public.ci_insumo('Ticket de comisión promedio',
          case when v_cierres > 0 then round(v_comision / v_cierres, 2) end, 'dinero'))),

    public.ci_indicador('meta', 'Meta del tramo', nullif(v_meta, 0), 'dinero',
      'Suma de las metas de comisión cargadas para los meses del tramo. Sin persona en el filtro se suman las de todo el equipo más las de la oficina.',
      jsonb_build_array(
        public.ci_insumo('Meses en el tramo',
          (extract(year from v_fin) * 12 + extract(month from v_fin))
          - (extract(year from v_ini) * 12 + extract(month from v_ini)) + 1, 'numero'))),

    public.ci_indicador('cumplimiento', 'Cumplimiento',
      case when v_meta > 0 then round(v_comision / v_meta * 100, 1) end, 'porcentaje',
      'Comisión del tramo ÷ meta del tramo. Sin meta cargada no se puede calcular, y el panel prefiere decirlo a inventar un 100%.',
      jsonb_build_array(
        public.ci_insumo('Comisión', v_comision, 'dinero'),
        public.ci_insumo('Meta', nullif(v_meta, 0), 'dinero'))),

    public.ci_indicador('brecha', 'Brecha contra la meta',
      case when v_meta > 0 then round(v_meta - v_comision, 2) end, 'dinero',
      'Meta menos lo realizado. En positivo es lo que falta; en negativo, lo que sobra.',
      '[]'::jsonb),

    public.ci_indicador('forecast', 'Pipeline ponderado', v_forecast, 'dinero',
      'Suma de (ingreso esperado × probabilidad) de TODAS las negociaciones abiertas, sin importar su fecha de cierre. No se suma a la comisión realizada: una es lo que entró y la otra lo que podría entrar.',
      jsonb_build_array(
        public.ci_insumo('Brecha por cubrir',
          case when v_meta > 0 then round(v_meta - v_comision, 2) end, 'dinero'))),

    public.ci_indicador('leads', 'Leads nuevos', v_leads, 'numero',
      'Leads creados dentro del tramo.',
      jsonb_build_array(
        public.ci_insumo('Pipeline abierto hoy', v_abiertos, 'numero'))),

    public.ci_indicador('conversion', 'Conversión lead → cierre',
      case when v_leads > 0 then round(v_ganados::numeric / v_leads * 100, 1) end, 'porcentaje',
      'Leads ganados en el tramo ÷ leads creados en el tramo. Es una foto, no una cohorte: un lead creado en enero y ganado en marzo cuenta en el numerador de marzo.',
      jsonb_build_array(
        public.ci_insumo('Ganados', v_ganados, 'numero'),
        public.ci_insumo('Perdidos', v_perdidos, 'numero'))),

    public.ci_indicador('captaciones', 'Captaciones', v_captaciones, 'numero',
      'Inmuebles cuya fecha de ingreso cae dentro del tramo.',
      jsonb_build_array(
        public.ci_insumo('Inventario disponible hoy', v_inventario, 'numero'))),

    public.ci_indicador('visitas', 'Visitas realizadas', v_visitas, 'numero',
      'Visitas marcadas como realizadas con fecha dentro del tramo.',
      jsonb_build_array(
        public.ci_insumo('Agendadas hacia adelante', v_agendadas, 'numero'),
        public.ci_insumo('Visitas por cierre',
          case when v_cierres > 0 then round(v_visitas::numeric / v_cierres, 1) end, 'numero'))),

    public.ci_indicador('cierres', 'Cierres', v_cierres, 'numero',
      'Negociaciones ganadas con fecha de cierre dentro del tramo.',
      jsonb_build_array(
        public.ci_insumo('Meta de cierres', nullif(v_meta_cierres, 0), 'numero'))),

    public.ci_indicador('primer_contacto', 'Días hasta el primer contacto',
      round(v_dias_contacto, 1), 'dias',
      'Promedio entre la creación del lead y el momento en que salió de «nuevo». Es la métrica que más decide una conversión y la que menos se mira.',
      jsonb_build_array(
        public.ci_insumo('Umbral configurado', v_u_contacto, 'dias'))),

    public.ci_indicador('ciclo', 'Días de una negociación',
      round(v_dias_cierre, 1), 'dias',
      'Promedio entre la apertura de la negociación y su cierre ganado.', '[]'::jsonb),

    public.ci_indicador('sin_accion', 'Registros sin próxima acción', v_sin_accion, 'numero',
      'Leads y negociaciones abiertos sin fecha de próxima acción. Ninguno debería estar aquí: es el control principal del sistema.',
      '[]'::jsonb)
  );

  -- ===================== EL EMBUDO =====================
  -- Va aparte de las listas porque se dibuja distinto: es una escalera
  -- y no una tabla.
  select coalesce(jsonb_agg(jsonb_build_object(
           'etapa', e.etapa, 'orden', e.orden,
           'cantidad', coalesce(c.n, 0)) order by e.orden), '[]'::jsonb)
    into v_embudo
    from (values ('nuevo',1),('contactado',2),('calificado',3),('con_inmueble',4),
                 ('visita_agendada',5),('visita_hecha',6),('oferta',7),
                 ('negociacion',8),('ganado',9),('perdido',10)) as e(etapa, orden)
    left join (
      select stage, count(*) n from public.rei_leads
       where company_id = p_company and deleted_at is null
         and (v_ciudad is null or city      = v_ciudad)
         and (v_broker is null or broker_id = v_broker)
         -- Ganado y perdido se cuentan solo dentro del tramo: si no,
         -- el embudo arrastraría para siempre todo lo cerrado desde
         -- que existe la oficina y la última barra taparía el resto.
         and (stage not in ('ganado','perdido')
              or (won_at  >= v_ini and won_at  < v_fin + 1)
              or (lost_at >= v_ini and lost_at < v_fin + 1))
       group by stage) c on c.stage = e.etapa;

  -- ===================== LAS SERIES =====================
  v_series := jsonb_build_array(
    -- Doce meses hacia atrás desde el fin del tramo. Se generan los
    -- meses y se cuenta contra ellos: sin `generate_series`, un mes
    -- sin un solo lead desaparecería del gráfico en vez de valer cero,
    -- y una caída a cero se leería como una subida.
    (select jsonb_build_object(
       'titulo', 'Leads y cierres',
       'nota', 'Doce meses hasta el final del tramo. Un mes sin actividad vale cero y se dibuja: no se salta.',
       'formato', 'numero',
       'leyenda', jsonb_build_array('Leads', 'Cierres'),
       'puntos', coalesce(jsonb_agg(jsonb_build_object(
                   'x', to_char(m.mes, 'YYYY-MM-DD'), 'formato_x', 'mes',
                   'y', coalesce(l.n, 0), 'y2', coalesce(d.n, 0)) order by m.mes), '[]'::jsonb))
       from generate_series(date_trunc('month', v_fin) - interval '11 months',
                            date_trunc('month', v_fin), interval '1 month') as m(mes)
       left join (select date_trunc('month', created_at) mes, count(*) n
                    from public.rei_leads
                   where company_id = p_company and deleted_at is null
                     and (v_ciudad is null or city      = v_ciudad)
                     and (v_broker is null or broker_id = v_broker)
                   group by 1) l on l.mes = m.mes
       left join (select date_trunc('month', closed_at) mes, count(*) n
                    from public.rei_deals
                   where company_id = p_company and deleted_at is null
                     and stage = 'ganado' and closed_at is not null
                     and (v_ciudad is null or city      = v_ciudad)
                     and (v_broker is null or broker_id = v_broker)
                   group by 1) d on d.mes = m.mes),

    (select jsonb_build_object(
       'titulo', 'Comisión mes a mes',
       'nota', 'Solo lo ganado con fecha de cierre. Lo que no tiene fecha no se reparte: se avisa.',
       'formato', 'dinero',
       'puntos', coalesce(jsonb_agg(jsonb_build_object(
                   'x', to_char(m.mes, 'YYYY-MM-DD'), 'formato_x', 'mes',
                   'y', coalesce(d.monto, 0)) order by m.mes), '[]'::jsonb))
       from generate_series(date_trunc('month', v_fin) - interval '11 months',
                            date_trunc('month', v_fin), interval '1 month') as m(mes)
       left join (select date_trunc('month', closed_at) mes, sum(expected_revenue) monto
                    from public.rei_deals
                   where company_id = p_company and deleted_at is null
                     and stage = 'ganado' and closed_at is not null
                     and (v_ciudad is null or city      = v_ciudad)
                     and (v_broker is null or broker_id = v_broker)
                   group by 1) d on d.mes = m.mes)
  );

  -- ===================== LAS LISTAS =====================
  v_listas := jsonb_build_array(

    -- ---------- el equipo ----------
    -- Cada corredor contra SU meta. Es la tabla del §11.C del
    -- documento y la que convierte el panel en una conversación.
    (select jsonb_build_object(
       'titulo', 'El equipo',
       'nota', 'Cada persona contra su meta del tramo. Sin meta cargada, la columna queda vacía: no se reparte la de la oficina entre todos.',
       'columnas', jsonb_build_array(
         jsonb_build_object('k','persona','t','Persona'),
         jsonb_build_object('k','leads','t','Leads','formato','numero'),
         jsonb_build_object('k','visitas','t','Visitas','formato','numero'),
         jsonb_build_object('k','cierres','t','Cierres','formato','numero'),
         jsonb_build_object('k','comision','t','Comisión','formato','dinero'),
         jsonb_build_object('k','meta','t','Meta','formato','dinero'),
         jsonb_build_object('k','cumplimiento','t','Cumple','formato','porcentaje'),
         jsonb_build_object('k','pipeline','t','Pipeline','formato','dinero')),
       'filas', coalesce(jsonb_agg(f.fila order by f.comision desc nulls last), '[]'::jsonb))
       from (
         select jsonb_build_object(
                  'persona', coalesce(nullif(btrim(pf.full_name), ''), pf.email, 'Sin asignar'),
                  'leads', coalesce(l.n, 0),
                  'visitas', coalesce(vi.n, 0),
                  'cierres', coalesce(dg.n, 0),
                  'comision', coalesce(dg.monto, 0),
                  'meta', t.meta,
                  'cumplimiento', case when t.meta > 0
                                       then round(coalesce(dg.monto, 0) / t.meta * 100, 1) end,
                  'pipeline', coalesce(da.ponderado, 0)) as fila,
                coalesce(dg.monto, 0) as comision
           from public.company_members m
           join public.profiles pf on pf.id = m.user_id
           left join (select broker_id, count(*) n from public.rei_leads
                       where company_id = p_company and deleted_at is null
                         and created_at >= v_ini and created_at < v_fin + 1
                         and (v_ciudad is null or city = v_ciudad)
                       group by 1) l on l.broker_id = m.user_id
           left join (select broker_id, count(*) n from public.rei_visits
                       where company_id = p_company and deleted_at is null
                         and status = 'realizada' and done_at >= v_ini and done_at < v_fin + 1
                       group by 1) vi on vi.broker_id = m.user_id
           left join (select broker_id, count(*) n, sum(expected_revenue) monto
                        from public.rei_deals
                       where company_id = p_company and deleted_at is null
                         and stage = 'ganado' and closed_at >= v_ini and closed_at < v_fin + 1
                         and (v_ciudad is null or city = v_ciudad)
                       group by 1) dg on dg.broker_id = m.user_id
           left join (select broker_id, sum(weighted_revenue) ponderado
                        from public.rei_deals
                       where company_id = p_company and deleted_at is null
                         and stage not in ('ganado','perdido')
                         and (v_ciudad is null or city = v_ciudad)
                       group by 1) da on da.broker_id = m.user_id
           left join (select user_id, sum(target_value) meta from public.rei_targets
                       where company_id = p_company and deleted_at is null
                         and metric = 'comision' and user_id is not null
                         and period_month between v_ini and v_fin
                       group by 1) t on t.user_id = m.user_id
          where m.company_id = p_company and m.status = 'active'
            and (v_broker is null or m.user_id = v_broker)
            -- Quien no tiene nada del tramo ni meta cargada no
            -- aparece: una tabla llena de ceros esconde a quien sí
            -- trabajó.
            and (l.n is not null or vi.n is not null or dg.n is not null
                 or da.ponderado is not null or t.meta is not null)
       ) f),

    -- ---------- el pipeline por etapa ----------
    (select jsonb_build_object(
       'titulo', 'Pipeline de negociaciones',
       'nota', 'Lo abierto, por etapa. «Ponderado» es el monto por la probabilidad de cada una.',
       'columnas', jsonb_build_array(
         jsonb_build_object('k','etapa','t','Etapa'),
         jsonb_build_object('k','cantidad','t','Negociaciones','formato','numero'),
         jsonb_build_object('k','monto','t','Comisión en juego','formato','dinero'),
         jsonb_build_object('k','ponderado','t','Ponderado','formato','dinero')),
       'filas', coalesce(jsonb_agg(jsonb_build_object(
                  'etapa', e.nombre, 'cantidad', coalesce(d.n, 0),
                  'monto', coalesce(d.monto, 0),
                  'ponderado', coalesce(d.ponderado, 0)) order by e.orden), '[]'::jsonb))
       from (values ('apertura','Apertura',1),('propuesta','Propuesta',2),
                    ('negociacion','Negociación',3),('promesa','Promesa',4),
                    ('escrituracion','Escrituración',5)) as e(clave, nombre, orden)
       left join (select stage, count(*) n, sum(expected_revenue) monto,
                         sum(weighted_revenue) ponderado
                    from public.rei_deals
                   where company_id = p_company and deleted_at is null
                     and stage not in ('ganado','perdido')
                     and (v_ciudad is null or city      = v_ciudad)
                     and (v_broker is null or broker_id = v_broker)
                   group by 1) d on d.stage = e.clave),

    -- ---------- la semana ----------
    -- Visitas agendadas y próximas acciones vencidas o de los
    -- próximos siete días, en una sola lista ordenada por fecha. Es
    -- la agenda del §8.1 del documento: lo que hay que hacer, no lo
    -- que pasó.
    (select jsonb_build_object(
       'titulo', 'Los próximos siete días',
       'nota', 'Visitas agendadas y próximas acciones comprometidas. Lo vencido aparece primero.',
       'columnas', jsonb_build_array(
         jsonb_build_object('k','cuando','t','Cuándo','formato','fecha'),
         jsonb_build_object('k','que','t','Qué'),
         jsonb_build_object('k','quien','t','Con quién'),
         jsonb_build_object('k','responsable','t','Responsable')),
       'filas', coalesce(jsonb_agg(a.fila order by a.cuando), '[]'::jsonb))
       from (
         select jsonb_build_object(
                  'cuando', to_char(v.scheduled_at, 'YYYY-MM-DD'),
                  'que', 'Visita · ' || coalesce(pr.code, pr.owner_name, 'inmueble'),
                  'quien', coalesce(l.name, cu.name, '—'),
                  'responsable', coalesce(nullif(btrim(pf.full_name), ''), pf.email, '—')) as fila,
                v.scheduled_at as cuando
           from public.rei_visits v
           left join public.rei_properties pr on pr.id = v.property_id
           left join public.rei_leads l       on l.id  = v.lead_id
           left join public.customers cu      on cu.id = v.customer_id
           left join public.profiles pf       on pf.id = v.broker_id
          where v.company_id = p_company and v.deleted_at is null
            and v.status in ('agendada','confirmada')
            and v.scheduled_at < current_date + 8
            and (v_ciudad is null or pr.city    = v_ciudad)
            and (v_broker is null or v.broker_id = v_broker)

          union all

         select jsonb_build_object(
                  'cuando', to_char(l.next_action_date, 'YYYY-MM-DD'),
                  'que', coalesce(l.next_action, 'Próxima acción'),
                  'quien', l.name,
                  'responsable', coalesce(nullif(btrim(pf.full_name), ''), pf.email, '—')),
                l.next_action_date::timestamptz
           from public.rei_leads l
           left join public.profiles pf on pf.id = l.broker_id
          where l.company_id = p_company and l.deleted_at is null
            and l.stage not in ('ganado','perdido')
            and l.next_action_date is not null
            and l.next_action_date < current_date + 8
            and (v_ciudad is null or l.city      = v_ciudad)
            and (v_broker is null or l.broker_id = v_broker)

          union all

         select jsonb_build_object(
                  'cuando', to_char(d.next_action_date, 'YYYY-MM-DD'),
                  'que', coalesce(d.next_action, 'Próxima acción') || ' · ' || d.name,
                  'quien', coalesce(cu.name, '—'),
                  'responsable', coalesce(nullif(btrim(pf.full_name), ''), pf.email, '—')),
                d.next_action_date::timestamptz
           from public.rei_deals d
           left join public.customers cu on cu.id = d.customer_id
           left join public.profiles pf  on pf.id = d.broker_id
          where d.company_id = p_company and d.deleted_at is null
            and d.stage not in ('ganado','perdido')
            and d.next_action_date is not null
            and d.next_action_date < current_date + 8
            and (v_ciudad is null or d.city      = v_ciudad)
            and (v_broker is null or d.broker_id = v_broker)
         limit 60
       ) a),

    -- ---------- vencimientos ----------
    -- Por tramos, como pide el §8.3. Los tramos son la información:
    -- «vence en 40 días» y «vence en 4» no se atienden igual.
    (select jsonb_build_object(
       'titulo', 'Contratos por vencer',
       'nota', 'Arriendos, mandatos y administraciones vigentes, agrupados por urgencia.',
       'columnas', jsonb_build_array(
         jsonb_build_object('k','tramo','t','Tramo'),
         jsonb_build_object('k','contratos','t','Contratos','formato','numero'),
         jsonb_build_object('k','canon','t','Canon mensual','formato','dinero')),
       'filas', coalesce(jsonb_agg(jsonb_build_object(
                  'tramo', t.nombre, 'contratos', coalesce(c.n, 0),
                  'canon', coalesce(c.monto, 0)) order by t.orden), '[]'::jsonb))
       from (values ('Vencidos',0),('0 a 7 días',1),('8 a 30 días',2),
                    ('31 a 60 días',3),('Más de 60 días',4)) as t(nombre, orden)
       left join (
         select case when end_date < current_date              then 0
                     when end_date <= current_date + 7         then 1
                     when end_date <= current_date + 30        then 2
                     when end_date <= current_date + 60        then 3
                     else 4 end as tramo,
                count(*) n, sum(monthly_amount) monto
           from public.rei_contracts
          where company_id = p_company and deleted_at is null
            and status in ('vigente','renovado') and end_date is not null
            and end_date <= current_date + make_interval(days => greatest(v_u_aviso, 61)::int)
            and (v_ciudad is null or city      = v_ciudad)
            and (v_broker is null or broker_id = v_broker)
          group by 1) c on c.tramo = t.orden),

    -- ---------- lo que nadie va a tocar ----------
    (select jsonb_build_object(
       'titulo', 'Sin próxima acción',
       'nota', 'Leads y negociaciones abiertos que nadie se comprometió a volver a tocar. Es la lista que hay que dejar vacía.',
       'columnas', jsonb_build_array(
         jsonb_build_object('k','tipo','t','Qué'),
         jsonb_build_object('k','nombre','t','Quién'),
         jsonb_build_object('k','etapa','t','Etapa'),
         jsonb_build_object('k','dias','t','Días quieto','formato','dias','tono','malo'),
         jsonb_build_object('k','responsable','t','Responsable')),
       'filas', coalesce(jsonb_agg(s.fila order by s.dias desc), '[]'::jsonb))
       from (
         select jsonb_build_object(
                  'tipo', 'Lead', 'nombre', l.name, 'etapa', l.stage,
                  'dias', round(extract(epoch from (now() - l.updated_at)) / 86400),
                  'responsable', coalesce(nullif(btrim(pf.full_name), ''), pf.email, 'Sin asignar')) as fila,
                extract(epoch from (now() - l.updated_at)) / 86400 as dias
           from public.rei_leads l
           left join public.profiles pf on pf.id = l.broker_id
          where l.company_id = p_company and l.deleted_at is null
            and l.stage not in ('ganado','perdido') and l.next_action_date is null
            and (v_ciudad is null or l.city      = v_ciudad)
            and (v_broker is null or l.broker_id = v_broker)

          union all

         select jsonb_build_object(
                  'tipo', 'Negociación', 'nombre', d.name, 'etapa', d.stage,
                  'dias', round(extract(epoch from (now() - d.updated_at)) / 86400),
                  'responsable', coalesce(nullif(btrim(pf.full_name), ''), pf.email, 'Sin asignar')),
                extract(epoch from (now() - d.updated_at)) / 86400
           from public.rei_deals d
           left join public.profiles pf on pf.id = d.broker_id
          where d.company_id = p_company and d.deleted_at is null
            and d.stage not in ('ganado','perdido') and d.next_action_date is null
            and (v_ciudad is null or d.city      = v_ciudad)
            and (v_broker is null or d.broker_id = v_broker)
         limit 40
       ) s)
  );

  -- ===================== LAS ALERTAS =====================
  -- Solo excepciones, como pide el §30. Un panel que avisa de todo no
  -- avisa de nada.
  if v_sin_contactar > 0 then
    v_alertas := v_alertas || public.ci_aviso('sin_contactar', 'malo',
      v_sin_contactar || ' lead(s) sin contactar',
      'Llevan más de ' || v_u_contacto || ' día(s) en «nuevo». El tiempo de primera respuesta es lo que más decide una conversión.');
  end if;

  if v_sin_accion > 0 then
    v_alertas := v_alertas || public.ci_aviso('sin_accion', 'malo',
      v_sin_accion || ' registro(s) abiertos sin próxima acción',
      'Ningún lead ni negociación viva debería estar sin una fecha comprometida. Es el control principal del módulo.');
  end if;

  if v_tareas_vencidas > 0 then
    v_alertas := v_alertas || public.ci_aviso('tareas_vencidas', 'malo',
      v_tareas_vencidas || ' pendiente(s) vencido(s)',
      'Actividades con fecha límite pasada y sin marcar como hechas.');
  end if;

  if v_detenidas > 0 then
    v_alertas := v_alertas || public.ci_aviso('detenidas', 'aviso',
      v_detenidas || ' negociación(es) detenida(s)',
      'Sin ningún movimiento en más de ' || v_u_detenido || ' días. Una negociación que no se mueve casi nunca se mueve sola.');
  end if;

  if v_vencen > 0 then
    v_alertas := v_alertas || public.ci_aviso('vencimientos', 'aviso',
      v_vencen || ' contrato(s) vencen pronto',
      'Dentro de los próximos ' || v_u_aviso || ' días. Representan un canon mensual de ' ||
      to_char(v_vencen_monto, 'FM999G999G999G990') || ' ' || coalesce(v_moneda, '') || '.');
  end if;

  if v_estancados > 0 then
    v_alertas := v_alertas || public.ci_aviso('estancados', 'aviso',
      v_estancados || ' inmueble(s) sin una sola visita',
      'Disponibles desde hace más de ' || v_u_estancado || ' días y nadie los ha ido a ver. A esa altura el problema casi nunca es la difusión: es el precio.');
  end if;

  if v_meta = 0 then
    v_alertas := v_alertas || public.ci_aviso('sin_meta', 'aviso',
      'No hay metas de comisión cargadas para el tramo',
      'Sin meta, el panel puede decir cuánto se hizo pero no si alcanza. Se cargan en la pestaña Metas.');
  end if;

  -- Un cierre sin fecha no se puede ubicar en ningún mes, así que no
  -- entra en ninguna curva. Se avisa en vez de repartirlo.
  if exists (select 1 from public.rei_deals
              where company_id = p_company and deleted_at is null
                and stage = 'ganado' and closed_at is null) then
    v_alertas := v_alertas || public.ci_aviso('cierre_sin_fecha', 'aviso',
      'Hay negociaciones ganadas sin fecha de cierre',
      'No entran en la comisión del tramo ni en la curva mensual: no se puede saber en qué mes ocurrieron.');
  end if;

  return jsonb_build_object(
    'moneda', v_moneda,
    'periodo', jsonb_build_object('desde', v_ini, 'hasta', v_fin),
    'cifras', v_cifras,
    'embudo', v_embudo,
    'series', v_series,
    'listas', v_listas,
    'alertas', v_alertas,
    'generado', now());
end $$;

comment on function public.rei_comercial(uuid, jsonb) is
  'Brokerage · el panel comercial entero en una llamada: cifras con su fórmula, embudo, curvas, equipo contra meta, agenda y alertas.';
revoke execute on function public.rei_comercial(uuid, jsonb) from public, anon;
grant  execute on function public.rei_comercial(uuid, jsonb) to authenticated;


-- ===========================================================
-- LAS OPCIONES DEL FILTRO
-- -----------------------------------------------------------
-- Quién puede ser el responsable de un lead. Sale de `company_members`
-- y no de un catálogo: ofrecer veinte nombres cuando la oficina tiene
-- tres es ruido, y `equipo()` devuelve correos que aquí no hacen falta.
-- ===========================================================
create or replace function public.rei_corredores(p_company uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.user_id,
           'nombre', coalesce(nullif(btrim(pf.full_name), ''), pf.email))
         order by coalesce(nullif(btrim(pf.full_name), ''), pf.email)), '[]'::jsonb)
    from public.company_members m
    join public.profiles pf on pf.id = m.user_id
   where m.company_id = p_company and m.status = 'active'
     and public.has_company_level(p_company, 40);
$$;
comment on function public.rei_corredores(uuid) is
  'Los miembros activos de la organización, para asignar responsables y filtrar el panel comercial.';
revoke execute on function public.rei_corredores(uuid) from public, anon;
grant  execute on function public.rei_corredores(uuid) to authenticated;


-- ===========================================================
-- EL RESPONSABLE, COMO RELACIÓN DEL MOTOR
-- -----------------------------------------------------------
-- El motor de datos resuelve un campo de relación consultando
-- `tabla.select(id, etiqueta).eq(company_id, …)`. Los corredores viven
-- en `company_members` × `profiles`, y ninguna de las dos tiene esa
-- forma: `profiles` no lleva company_id y `company_members` no lleva
-- nombre.
--
-- Una vista los junta y le da al motor exactamente lo que espera, sin
-- tocar el motor. Va con `security_invoker` para que las políticas de
-- las dos tablas de abajo sigan mandando: quien no comparte empresa
-- con alguien no lo ve aquí tampoco.
-- ===========================================================
create or replace view public.rei_brokers
with (security_invoker = true) as
  select m.user_id    as id,
         m.company_id as company_id,
         coalesce(nullif(btrim(pf.full_name), ''), pf.email) as name,
         m.status     as status
    from public.company_members m
    join public.profiles pf on pf.id = m.user_id
   where m.status = 'active';

comment on view public.rei_brokers is
  'Los miembros activos con nombre legible, en la forma que el motor de datos espera de una relación (id, company_id, name).';
grant select on public.rei_brokers to authenticated;
