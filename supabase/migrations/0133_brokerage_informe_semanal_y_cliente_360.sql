-- ===========================================================
-- 0133 · El informe semanal y la ficha 360
-- -----------------------------------------------------------
-- Las dos pantallas que el documento pone como P0 y que seguían sin
-- existir. Las dos leen lo que ya hay: ninguna agrega una tabla.
--
--   §11 · §49  Weekly Management Report
--   §16 a §18  Client 360
--
-- LO QUE EL INFORME NO HACE, Y ES LA MITAD DE SU VALOR
--
-- Un informe automático que rellena todos sus huecos es un informe
-- que miente en los huecos. El de aquí lleva un array `notas` donde
-- dice qué NO pudo calcular y por qué: «no hay meta cargada para el
-- mes», «el modelo no distingue la fecha de captación de la de
-- publicación». Quien lo lea sabrá distinguir un cero de un no sé.
--
-- Eso vale más que una casilla llena. La minuta se lleva a una
-- reunión, y un número inventado en una reunión se convierte en una
-- decisión inventada.
-- ===========================================================

create or replace function public.rei_informe_semanal(
  p_company uuid, p_semana date default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_moneda text;
  v_lun date; v_dom date; v_mes_ini date; v_mes_fin date;
  v_notas jsonb := '[]'::jsonb;
  v_com_sem numeric; v_cierres_sem int;
  v_com_mes numeric; v_cierres_mes int; v_meta_mes numeric; v_ponderado numeric;
  v_captaciones int; v_leads int; v_visitas int; v_ofertas int;
  v_com_esperada numeric;
  v_contratos int; v_vencen int; v_tareas int; v_tareas_venc int; v_incompletos int;
  v_op_nuevas int; v_op_screening int; v_fact int; v_go int;
  v_equipo jsonb; v_riesgos jsonb; v_victorias jsonb;
begin
  if not public.has_company_level(p_company, 60) then return '{}'::jsonb; end if;

  select currency into v_moneda from public.companies where id = p_company;

  -- La semana va de lunes a domingo. `date_trunc('week')` en PostgreSQL
  -- ya empieza en lunes, que es como se cuenta una semana comercial
  -- aquí; no hace falta corregirlo.
  v_lun := date_trunc('week', coalesce(p_semana, current_date))::date;
  v_dom := v_lun + 6;
  v_mes_ini := date_trunc('month', v_lun)::date;
  v_mes_fin := (date_trunc('month', v_lun) + interval '1 month' - interval '1 day')::date;

  -- ---------- A · la semana y el acumulado del mes ----------
  select count(*) filter (where closed_at::date between v_lun and v_dom),
         coalesce(sum(expected_revenue) filter (where closed_at::date between v_lun and v_dom), 0),
         count(*) filter (where closed_at::date between v_mes_ini and v_mes_fin),
         coalesce(sum(expected_revenue) filter (where closed_at::date between v_mes_ini and v_mes_fin), 0)
    into v_cierres_sem, v_com_sem, v_cierres_mes, v_com_mes
    from public.rei_deals
   where company_id = p_company and deleted_at is null and stage = 'ganado' and closed_at is not null;

  select coalesce(sum(weighted_revenue), 0) into v_ponderado
    from public.rei_deals
   where company_id = p_company and deleted_at is null and stage not in ('ganado','perdido');

  select coalesce(sum(target_value), 0) into v_meta_mes
    from public.rei_targets
   where company_id = p_company and deleted_at is null
     and metric = 'comision' and period_month = v_mes_ini;

  if v_meta_mes = 0 then
    v_notas := v_notas || jsonb_build_array(
      'No hay meta de comisión cargada para ' || to_char(v_mes_ini, 'TMMonth YYYY') ||
      ': el cumplimiento y la brecha quedan en blanco en vez de calcularse contra cero.');
  end if;

  -- ---------- D · brokerage de la semana ----------
  select count(*) filter (where entry_date between v_lun and v_dom) into v_captaciones
    from public.rei_properties where company_id = p_company and deleted_at is null;

  select count(*) filter (where created_at::date between v_lun and v_dom) into v_leads
    from public.rei_leads where company_id = p_company and deleted_at is null;

  select count(*) filter (where status = 'realizada' and done_at::date between v_lun and v_dom)
    into v_visitas
    from public.rei_visits where company_id = p_company and deleted_at is null;

  -- «Ofertas» es el paso por la etapa oferta, no el estado actual: un
  -- lead que ofertó el martes y negocia el viernes hizo una oferta esa
  -- semana. Por eso se mira `offer_at` y no `stage`.
  select count(*) filter (where offer_at::date between v_lun and v_dom) into v_ofertas
    from public.rei_leads where company_id = p_company and deleted_at is null;

  select coalesce(sum(expected_revenue), 0) into v_com_esperada
    from public.rei_deals
   where company_id = p_company and deleted_at is null and stage not in ('ganado','perdido');

  v_notas := v_notas || jsonb_build_array(
    'El bloque de brokerage no incluye «publicaciones»: el inventario guarda la fecha de ingreso, que es cuando se captó, y no una fecha de publicación distinta.');

  -- ---------- E · operaciones ----------
  select count(*) filter (where status in ('vigente','renovado')),
         count(*) filter (where status in ('vigente','renovado') and end_date is not null
                            and end_date between current_date and current_date + 30)
    into v_contratos, v_vencen
    from public.rei_contracts where company_id = p_company and deleted_at is null;

  select count(*) filter (where due_date is not null and done_at is null),
         count(*) filter (where due_date is not null and done_at is null and due_date < current_date)
    into v_tareas, v_tareas_venc
    from public.rei_activities where company_id = p_company and deleted_at is null;

  -- «Documentos faltantes» del §11.E, traducido a lo que esta base
  -- puede saber: registros comerciales vivos a los que les falta el
  -- dato con el que se miden.
  select count(*) into v_incompletos
    from public.rei_properties
   where company_id = p_company and deleted_at is null
     and (area_m2 is null or area_m2 = 0 or list_price is null or list_price = 0
          or entry_date is null
          or (lower(commercial_status) = 'vendido' and sale_date is null));

  -- ---------- F · desarrollo ----------
  select count(*) filter (where created_at::date between v_lun and v_dom),
         count(*) filter (where status in ('evaluacion','due_diligence')),
         count(*) filter (where status = 'aprobada')
    into v_op_nuevas, v_op_screening, v_go
    from public.rei_opportunities where company_id = p_company and deleted_at is null;

  select count(*) into v_fact
    from public.rei_feasibility f
    join public.rei_developments d on d.id = f.development_id
   where f.company_id = p_company and f.deleted_at is null and d.status = 'activo';

  -- ---------- C · el equipo ----------
  select coalesce(jsonb_agg(f.fila order by f.resultado desc nulls last), '[]'::jsonb)
    into v_equipo
    from (
      select jsonb_build_object(
               'persona', coalesce(nullif(btrim(pf.full_name), ''), pf.email),
               'meta', t.meta,
               'resultado', coalesce(g.monto, 0),
               'cumplimiento', case when t.meta > 0 then round(coalesce(g.monto, 0) / t.meta * 100, 1) end,
               'pipeline', coalesce(a.ponderado, 0),
               'actividad', coalesce(ac.n, 0),
               'conversion', case when coalesce(nl.n, 0) > 0
                                  then round(coalesce(gl.n, 0)::numeric / nl.n * 100, 1) end,
               'pendientes', coalesce(pe.n, 0)) fila,
             coalesce(g.monto, 0) resultado
        from public.company_members m
        join public.profiles pf on pf.id = m.user_id
        left join (select user_id, sum(target_value) meta from public.rei_targets
                    where company_id = p_company and deleted_at is null
                      and metric = 'comision' and user_id is not null and period_month = v_mes_ini
                    group by 1) t on t.user_id = m.user_id
        left join (select broker_id, sum(expected_revenue) monto from public.rei_deals
                    where company_id = p_company and deleted_at is null and stage = 'ganado'
                      and closed_at::date between v_mes_ini and v_mes_fin group by 1) g on g.broker_id = m.user_id
        left join (select broker_id, sum(weighted_revenue) ponderado from public.rei_deals
                    where company_id = p_company and deleted_at is null
                      and stage not in ('ganado','perdido') group by 1) a on a.broker_id = m.user_id
        left join (select owner_id, count(*) n from public.rei_activities
                    where company_id = p_company and deleted_at is null
                      and happened_at::date between v_lun and v_dom group by 1) ac on ac.owner_id = m.user_id
        left join (select broker_id, count(*) n from public.rei_leads
                    where company_id = p_company and deleted_at is null
                      and created_at::date between v_mes_ini and v_mes_fin group by 1) nl on nl.broker_id = m.user_id
        left join (select broker_id, count(*) n from public.rei_leads
                    where company_id = p_company and deleted_at is null and stage = 'ganado'
                      and won_at::date between v_mes_ini and v_mes_fin group by 1) gl on gl.broker_id = m.user_id
        left join (select broker_id, count(*) n from public.rei_leads
                    where company_id = p_company and deleted_at is null
                      and stage not in ('ganado','perdido') and next_action_date is null
                    group by 1) pe on pe.broker_id = m.user_id
       where m.company_id = p_company and m.status = 'active'
         and (t.meta is not null or g.monto is not null or a.ponderado is not null
              or ac.n is not null or nl.n is not null)
    ) f;

  if jsonb_array_length(v_equipo) = 0 then
    v_notas := v_notas || jsonb_build_array(
      'El bloque de equipo sale vacío: nadie tiene meta cargada ni actividad registrada en el tramo.');
  end if;

  -- ---------- riesgos y victorias ----------
  -- Los riesgos no se redactan: se derivan de las mismas condiciones
  -- que alimentan las alertas del panel. Un informe cuyos riesgos se
  -- escriben a mano acaba repitiendo los del mes pasado.
  v_riesgos := '[]'::jsonb;
  if v_tareas_venc > 0 then
    v_riesgos := v_riesgos || jsonb_build_array(v_tareas_venc || ' pendiente(s) vencido(s) sin cerrar');
  end if;
  if v_vencen > 0 then
    v_riesgos := v_riesgos || jsonb_build_array(v_vencen || ' contrato(s) vencen en los próximos 30 días');
  end if;
  if v_incompletos > 0 then
    v_riesgos := v_riesgos || jsonb_build_array(
      v_incompletos || ' inmueble(s) con datos incompletos: quedan fuera de los comparables o de las curvas');
  end if;
  if v_meta_mes > 0 and v_com_mes < v_meta_mes * 0.5
     and current_date > v_mes_ini + 15 then
    v_riesgos := v_riesgos || jsonb_build_array(
      'A mitad de mes el cumplimiento va por debajo de la mitad de la meta');
  end if;
  select coalesce(count(*), 0) into v_go from public.rei_opportunities
   where company_id = p_company and deleted_at is null and status = 'aprobada';

  v_victorias := '[]'::jsonb;
  if v_cierres_sem > 0 then
    v_victorias := v_victorias || jsonb_build_array(
      v_cierres_sem || ' cierre(s) esta semana por ' ||
      to_char(v_com_sem, 'FM999G999G999G990') || ' ' || coalesce(v_moneda, '') || ' de comisión');
  end if;
  if v_captaciones > 0 then
    v_victorias := v_victorias || jsonb_build_array(v_captaciones || ' captación(es) nueva(s)');
  end if;
  if v_visitas > 0 then
    v_victorias := v_victorias || jsonb_build_array(v_visitas || ' visita(s) realizada(s)');
  end if;

  return jsonb_build_object(
    'moneda', v_moneda,
    'semana', jsonb_build_object('desde', v_lun, 'hasta', v_dom,
                                 'mes_desde', v_mes_ini, 'mes_hasta', v_mes_fin),
    'resumen', jsonb_build_object(
      'cierres_semana', v_cierres_sem, 'comision_semana', v_com_sem,
      'cierres_mes', v_cierres_mes, 'comision_mes', v_com_mes,
      'meta_mes', nullif(v_meta_mes, 0),
      'brecha', case when v_meta_mes > 0 then round(v_meta_mes - v_com_mes, 2) end,
      'riesgos', v_riesgos, 'victorias', v_victorias),
    'revenue', jsonb_build_object(
      'meta', nullif(v_meta_mes, 0), 'real', v_com_mes,
      'cumplimiento', case when v_meta_mes > 0 then round(v_com_mes / v_meta_mes * 100, 1) end,
      'proyeccion', round(v_com_mes + v_ponderado, 2),
      'pipeline_ponderado', v_ponderado,
      'brecha', case when v_meta_mes > 0 then round(v_meta_mes - v_com_mes, 2) end),
    'equipo', v_equipo,
    'brokerage', jsonb_build_object(
      'captaciones', v_captaciones, 'leads', v_leads, 'visitas', v_visitas,
      'ofertas', v_ofertas, 'cierres', v_cierres_sem,
      'comision_esperada', v_com_esperada, 'comision_realizada', v_com_sem),
    'operaciones', jsonb_build_object(
      'contratos_vigentes', v_contratos, 'vencen_30_dias', v_vencen,
      'tareas_pendientes', v_tareas, 'tareas_vencidas', v_tareas_venc,
      'registros_incompletos', v_incompletos),
    'desarrollo', jsonb_build_object(
      'oportunidades_nuevas', v_op_nuevas, 'en_screening', v_op_screening,
      'factibilidades_activas', v_fact, 'aprobadas', v_go),
    'notas', v_notas,
    'generado', now());
end $$;
comment on function public.rei_informe_semanal(uuid, date) is
  'Brokerage · §11 y §49. La minuta semanal a partir de datos estructurados. Lleva un array `notas` con lo que NO pudo calcular y por qué: un informe que rellena sus huecos miente en los huecos.';
revoke execute on function public.rei_informe_semanal(uuid, date) from public, anon;
grant  execute on function public.rei_informe_semanal(uuid, date) to authenticated;


-- ===========================================================
-- §16 a §18 · CLIENT 360
-- -----------------------------------------------------------
-- Una ficha de cliente que reúne en una consulta lo que hoy exige
-- abrir seis pestañas. Las relaciones ya existían todas; lo que
-- faltaba era juntarlas.
--
-- El §18 pide no esconder información importante por límites
-- visuales. Esta función devuelve TODO lo que hay del cliente, y deja
-- que la pantalla decida cómo repartirlo en pestañas o paneles. Es al
-- revés de como suele hacerse —traer poco y pedir más al hacer clic—
-- y es a propósito: a la escala de una inmobiliaria local, un cliente
-- tiene decenas de filas, no miles, y una ficha que se completa a
-- trozos es una ficha donde nunca se sabe si ya está todo.
--
-- El permiso se resuelve por la EMPRESA DEL CLIENTE y no por un
-- parámetro: pasar un company_id junto al cliente permitiría pedir la
-- ficha de un cliente ajeno declarando la empresa propia.
-- ===========================================================
create or replace function public.rei_cliente_360(p_customer uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare c record; v_empresa uuid;
begin
  select * into c from public.customers where id = p_customer;
  if c is null then return '{}'::jsonb; end if;
  v_empresa := c.company_id;
  if not public.has_company_level(v_empresa, 40) then return '{}'::jsonb; end if;

  return jsonb_build_object(
    'identidad', jsonb_build_object(
      'id', c.id, 'nombre', c.name, 'tipo', c.customer_type, 'estado', c.status,
      'telefono', nullif(c.phone, ''), 'whatsapp', nullif(c.whatsapp, ''),
      'email', nullif(c.email, ''), 'ciudad', nullif(c.comuna, ''),
      'direccion', nullif(c.address, ''), 'razon_social', nullif(c.company, ''),
      'contacto', nullif(c.contact_name, ''), 'notas', nullif(c.notes, ''),
      'desde', c.created_at),

    -- ---------- de dónde vino ----------
    -- El origen no vive en la ficha: vive en el primer lead que la
    -- trajo. Se toma el más antiguo, que es el que de verdad explica
    -- cómo llegó esta persona.
    'origen', (
      select jsonb_build_object(
               'canal', nullif(l.source, ''), 'campana', nullif(l.campaign, ''),
               'entrada', l.created_at, 'primera_interaccion', l.first_contact_at,
               'operacion', l.operation)
        from public.rei_leads l
       where l.customer_id = p_customer and l.deleted_at is null
       order by l.created_at limit 1),

    -- ---------- qué busca ----------
    'necesidad', (
      select jsonb_build_object(
               'busca', nullif(b.wanted_type, ''), 'zona', nullif(b.sector, ''),
               'presupuesto', b.budget, 'forma_pago', nullif(b.payment_terms, ''),
               'subsidio', nullif(b.subsidy_type, ''), 'proceso', nullif(b.process_status, ''),
               'estado', nullif(b.client_status, ''))
        from public.rei_buyers b
       where b.customer_id = p_customer and b.deleted_at is null
       order by b.created_at desc limit 1),

    -- ---------- las cifras de esta relación ----------
    'cifras', jsonb_build_object(
      'inmuebles', (select count(*) from public.rei_properties
                     where owner_customer_id = p_customer and deleted_at is null),
      'negociaciones', (select count(*) from public.rei_deals
                         where customer_id = p_customer and deleted_at is null),
      'ganadas', (select count(*) from public.rei_deals
                   where customer_id = p_customer and deleted_at is null and stage = 'ganado'),
      'comision_generada', (select coalesce(sum(expected_revenue), 0) from public.rei_deals
                             where customer_id = p_customer and deleted_at is null and stage = 'ganado'),
      'visitas', (select count(*) from public.rei_visits
                   where customer_id = p_customer and deleted_at is null),
      'contratos_vigentes', (select count(*) from public.rei_contracts
                              where (customer_id = p_customer or owner_customer_id = p_customer)
                                and deleted_at is null and status in ('vigente','renovado'))),

    -- ---------- relaciones ----------
    'inmuebles', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'codigo', coalesce(p.code, '—'), 'tipo', p.property_type,
               'ciudad', nullif(p.city, ''), 'barrio', nullif(p.neighborhood, ''),
               'area', p.area_m2, 'precio', p.list_price, 'precio_m2', p.price_m2,
               'estado', p.commercial_status, 'ingreso', p.entry_date, 'venta', p.sale_date)
             order by p.created_at desc)
        from public.rei_properties p
       where p.owner_customer_id = p_customer and p.deleted_at is null), '[]'::jsonb),

    'leads', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', l.id, 'codigo', coalesce(l.code, '—'), 'nombre', l.name,
               'etapa', l.stage, 'operacion', l.operation,
               'proxima_accion', l.next_action, 'para_cuando', l.next_action_date,
               'responsable', coalesce(nullif(btrim(pf.full_name), ''), pf.email))
             order by l.created_at desc)
        from public.rei_leads l
        left join public.profiles pf on pf.id = l.broker_id
       where l.customer_id = p_customer and l.deleted_at is null), '[]'::jsonb),

    'negociaciones', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', d.id, 'codigo', coalesce(d.code, '—'), 'nombre', d.name,
               'tipo', d.deal_type, 'etapa', d.stage,
               'valor', d.property_value, 'ingreso', d.expected_revenue,
               'probabilidad', d.probability_pct, 'cierre', d.expected_close_date,
               'proxima_accion', d.next_action, 'para_cuando', d.next_action_date,
               'responsable', coalesce(nullif(btrim(pf.full_name), ''), pf.email))
             order by d.created_at desc)
        from public.rei_deals d
        left join public.profiles pf on pf.id = d.broker_id
       where d.customer_id = p_customer and d.deleted_at is null), '[]'::jsonb),

    'contratos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', k.id, 'codigo', coalesce(k.code, '—'), 'nombre', k.name,
               'tipo', k.contract_type, 'estado', k.status,
               'desde', k.start_date, 'vence', k.end_date, 'canon', k.monthly_amount,
               'papel', case when k.owner_customer_id = p_customer then 'Propietario'
                             else 'Arrendatario o comprador' end)
             order by k.end_date nulls last)
        from public.rei_contracts k
       where (k.customer_id = p_customer or k.owner_customer_id = p_customer)
         and k.deleted_at is null), '[]'::jsonb),

    'visitas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', v.id, 'codigo', coalesce(v.code, '—'),
               'inmueble', coalesce(pr.code, pr.owner_name),
               'cuando', v.scheduled_at, 'realizada', v.done_at,
               'estado', v.status, 'interes', v.interest_level,
               'comentario', nullif(v.feedback, ''))
             order by v.scheduled_at desc)
        from public.rei_visits v
        left join public.rei_properties pr on pr.id = v.property_id
       where v.customer_id = p_customer and v.deleted_at is null), '[]'::jsonb),

    -- La bitácora completa del cliente: lo suyo directo más lo que
    -- cuelga de sus leads y negociaciones. Es la parte que hoy obliga
    -- a recorrer pestañas para reconstruir una conversación.
    'actividad', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'tipo', a.kind, 'asunto', a.subject,
               'detalle', nullif(a.detail, ''), 'cuando', a.happened_at,
               'limite', a.due_date, 'hecha', a.done_at,
               'responsable', coalesce(nullif(btrim(pf.full_name), ''), pf.email))
             order by a.happened_at desc)
        from public.rei_activities a
        left join public.profiles pf on pf.id = a.owner_id
       where a.deleted_at is null
         and (a.customer_id = p_customer
              or a.lead_id in (select id from public.rei_leads where customer_id = p_customer)
              or a.deal_id in (select id from public.rei_deals where customer_id = p_customer))
      ), '[]'::jsonb),

    'generado', now());
end $$;
comment on function public.rei_cliente_360(uuid) is
  'Brokerage · §16 a §18. Todo lo que hay de un cliente en una consulta: identidad, origen, necesidad, cifras, inmuebles, leads, negociaciones, contratos, visitas y bitácora. El permiso se resuelve por la empresa del cliente, nunca por un parámetro.';
revoke execute on function public.rei_cliente_360(uuid) from public, anon;
grant  execute on function public.rei_cliente_360(uuid) to authenticated;
