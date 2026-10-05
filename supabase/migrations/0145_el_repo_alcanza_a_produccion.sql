-- =====================================================================
-- 0145 · El repo alcanza a producción
--
-- Treinta y cuatro funciones quedaron en producción con un cuerpo distinto
-- al del último archivo que las define en el repo: correcciones aplicadas
-- desde el editor de SQL y comentarios que cambiaron después. Esta
-- migración las fija tal como están HOY en producción (pg_get_functiondef,
-- 05-10-2026).
--
-- En producción es un no-op: redefine cada función con su propia
-- definición. En una base nueva deja el mismo resultado que producción.
-- Comprobado con supabase/tests/reconstruir: estructura idéntica (3.080 de
-- 3.080 objetos) y cuerpos idénticos para todas las funciones, salvo las que
-- deja distintas una migración anterior del repo pendiente en producción
-- (ver el anexo privado de la auditoría).
--
-- No se tocan permisos: create or replace conserva los que la función ya
-- tiene.
-- =====================================================================

-- aceptar_invitaciones()
CREATE OR REPLACE FUNCTION public.aceptar_invitaciones()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid   uuid := (select auth.uid());
  v_email text;
  v_n     integer := 0;
  v_inv   record;
begin
  if v_uid is null then return 0; end if;
  select lower(email) into v_email from auth.users where id = v_uid;
  if v_email is null then return 0; end if;

  for v_inv in
    select i.id, i.company_id, i.role_id
      from public.user_invitations i
     where lower(i.email) = v_email
       and i.used_at is null
       and i.expires_at > now()
  loop
    insert into public.company_members (company_id, user_id, role_id, status)
    select v_inv.company_id, v_uid,
           coalesce(v_inv.role_id, (select id from public.roles
                                     where slug = 'employee' and scope = 'company')),
           'active'
     where not exists (
       select 1 from public.company_members m
        where m.company_id = v_inv.company_id and m.user_id = v_uid);

    update public.user_invitations
       set used_at = now(), used_by = v_uid
     where id = v_inv.id;

    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$function$;

-- analisis_financiero(p_company uuid, p_desde date, p_hasta date)
CREATE OR REPLACE FUNCTION public.analisis_financiero(p_company uuid, p_desde date DEFAULT (CURRENT_DATE - 180), p_hasta date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_dias    integer := greatest(1, (p_hasta - p_desde) + 1);
  v_antes_d date    := p_desde - v_dias;
  v_antes_h date    := p_desde - 1;
  v_moneda  text;
  r         jsonb;
  v_ingresos numeric := 0; v_costo numeric := 0; v_pedidos integer := 0;
  v_compras  numeric := 0; v_mermas numeric := 0; v_gastos numeric := 0;
  v_margen   numeric := 0; v_resultado numeric := 0;
  v_ing_antes numeric := 0; v_mar_antes numeric := 0; v_res_antes numeric := 0;
  v_gas_antes numeric := 0; v_com_antes numeric := 0;
  v_cobros numeric := 0; v_pagos numeric := 0;
  v_cobrar numeric := 0; v_cobrar_venc numeric := 0; v_cobrar_docs integer := 0;
  v_pagar  numeric := 0; v_pagar_venc  numeric := 0; v_pagar_docs  integer := 0;
  v_inv    numeric := 0; v_lotes integer := 0;
  v_dso numeric; v_dpo numeric;
  alertas jsonb := '[]'::jsonb;
begin
  if not public.has_company_level(p_company, 60) then
    return '{}'::jsonb;
  end if;

  select currency into v_moneda from public.companies where id = p_company;

  select coalesce(sum(o.total),0), coalesce(sum(o.cost_total),0), count(*)
    into v_ingresos, v_costo, v_pedidos
    from public.orders o
   where o.company_id = p_company and o.status <> 'cancelado'
     and o.order_date::date between p_desde and p_hasta;

  select coalesce(sum(p.total),0) into v_compras
    from public.purchases p
   where p.company_id = p_company and p.status = 'recibida'
     and p.purchase_date between p_desde and p_hasta;

  select coalesce(sum(l.cost),0) into v_mermas
    from public.losses l
   where l.company_id = p_company
     and l.created_at::date between p_desde and p_hasta;

  select coalesce(sum(f.amount),0) into v_gastos
    from public.finance_entries f
   where f.company_id = p_company and f.kind = 'expense'
     and coalesce(f.occurred_at, f.created_at::date) between p_desde and p_hasta;

  v_margen    := v_ingresos - v_costo;
  v_resultado := v_margen - v_gastos - v_mermas;

  select coalesce(sum(o.total),0), coalesce(sum(o.total - o.cost_total),0)
    into v_ing_antes, v_mar_antes
    from public.orders o
   where o.company_id = p_company and o.status <> 'cancelado'
     and o.order_date::date between v_antes_d and v_antes_h;

  select coalesce(sum(f.amount),0) into v_gas_antes
    from public.finance_entries f
   where f.company_id = p_company and f.kind = 'expense'
     and coalesce(f.occurred_at, f.created_at::date) between v_antes_d and v_antes_h;

  select coalesce(sum(p.total),0) into v_com_antes
    from public.purchases p
   where p.company_id = p_company and p.status = 'recibida'
     and p.purchase_date between v_antes_d and v_antes_h;

  v_res_antes := v_mar_antes - v_gas_antes;

  select coalesce(sum(amount) filter (where direction = 'cobro'), 0),
         coalesce(sum(amount) filter (where direction = 'pago'),  0)
    into v_cobros, v_pagos
    from public.payments
   where company_id = p_company and paid_at::date between p_desde and p_hasta;

  select coalesce(sum(saldo),0),
         coalesce(sum(saldo) filter (where vence < current_date), 0),
         count(*)
    into v_cobrar, v_cobrar_venc, v_cobrar_docs
    from (
      select (o.total - o.amount_paid) as saldo,
             coalesce(o.due_date, o.order_date::date) as vence
        from public.orders o
       where o.company_id = p_company and o.status <> 'cancelado'
         and o.total > o.amount_paid
      union all
      select (r.amount - r.amount_paid), coalesce(r.due_date, r.issued_at)
        from public.opening_receivables r
       where r.company_id = p_company and r.amount > r.amount_paid
    ) x;

  select coalesce(sum(saldo),0),
         coalesce(sum(saldo) filter (where vence < current_date), 0),
         count(*)
    into v_pagar, v_pagar_venc, v_pagar_docs
    from (
      select (p.total - p.amount_paid) as saldo,
             coalesce(p.due_date, p.purchase_date) as vence
        from public.purchases p
       where p.company_id = p_company and p.status = 'recibida'
         and p.total > p.amount_paid
      union all
      select (a.amount - a.amount_paid), coalesce(a.due_date, a.issued_at)
        from public.opening_payables a
       where a.company_id = p_company and a.amount > a.amount_paid
    ) y;

  select count(*), coalesce(sum(quantity_on_hand * unit_cost), 0)
    into v_lotes, v_inv
    from public.inventory_lots
   where company_id = p_company and status = 'disponible';

  v_dso := case when v_ingresos > 0 then round(v_cobrar / v_ingresos * v_dias) end;
  v_dpo := case when v_compras  > 0 then round(v_pagar  / v_compras  * v_dias) end;

  if v_ingresos > 0 and v_margen / v_ingresos < 0.15 then
    alertas := alertas || jsonb_build_object(
      'clave','margen_bajo','tono','malo','titulo','El margen está por debajo del 15%',
      'detalle', 'De cada 100 que vendes te quedan ' ||
                 round(v_margen / v_ingresos * 100)::text ||
                 '. Revisa precios de venta y costo de compra antes de vender más.');
  end if;

  if v_resultado < 0 then
    alertas := alertas || jsonb_build_object(
      'clave','resultado_negativo','tono','malo','titulo','El período cierra en pérdida',
      'detalle','El margen no alcanza a cubrir gastos y mermas. La diferencia sale del bolsillo o de la deuda.');
  end if;

  if v_cobrar > 0 and v_cobrar_venc / nullif(v_cobrar,0) > 0.3 then
    alertas := alertas || jsonb_build_object(
      'clave','morosidad','tono','malo','titulo','Más de un tercio de lo por cobrar está vencido',
      'detalle', round(v_cobrar_venc / v_cobrar * 100)::text ||
                 '% de la deuda pasó su fecha. Cobrar eso es más barato que vender lo mismo de nuevo.');
  end if;

  if v_dso is not null and v_dpo is not null and v_dso > v_dpo + 15 then
    alertas := alertas || jsonb_build_object(
      'clave','desfase','tono','aviso','titulo','Cobras más lento de lo que pagas',
      'detalle','Tardas ' || v_dso::text || ' días en cobrar y pagas en ' || v_dpo::text ||
                '. Ese desfase lo financias tú.');
  end if;

  if v_cobros > 0 and v_pagos > v_cobros then
    alertas := alertas || jsonb_build_object(
      'clave','caja_negativa','tono','aviso','titulo','Salió más plata de la que entró',
      'detalle','En el período pagaste más de lo que cobraste. Puede ser normal si compraste stock; no lo es dos períodos seguidos.');
  end if;

  if v_inv > 0 and v_ingresos > 0 and v_inv > v_ingresos * 0.5 then
    alertas := alertas || jsonb_build_object(
      'clave','inventario_alto','tono','aviso','titulo','Hay mucha plata detenida en bodega',
      'detalle','El inventario vale más de la mitad de lo que vendiste en el período.');
  end if;

  r := jsonb_build_object(
    'periodo', jsonb_build_object('desde', p_desde, 'hasta', p_hasta,
                                  'dias', v_dias, 'moneda', v_moneda),

    'resultado', jsonb_build_object(
      'ingresos', v_ingresos, 'costo_ventas', v_costo, 'margen_bruto', v_margen,
      'margen_pct', case when v_ingresos > 0 then round(v_margen / v_ingresos * 100, 1) else null end,
      'compras', v_compras, 'mermas', v_mermas, 'gastos', v_gastos,
      'resultado_neto', v_resultado, 'pedidos', v_pedidos,
      'ticket', case when v_pedidos > 0 then round(v_ingresos / v_pedidos) else 0 end),

    'antes', jsonb_build_object('ingresos', v_ing_antes, 'margen_bruto', v_mar_antes,
                                'resultado_neto', v_res_antes, 'gastos', v_gas_antes,
                                'compras', v_com_antes,
                                'desde', v_antes_d, 'hasta', v_antes_h),

    'caja', jsonb_build_object('cobros', v_cobros, 'pagos', v_pagos, 'neto', v_cobros - v_pagos),

    'cobrar', jsonb_build_object('total', v_cobrar, 'vencido', v_cobrar_venc,
                                 'documentos', v_cobrar_docs, 'dias', v_dso),
    'pagar',  jsonb_build_object('total', v_pagar,  'vencido', v_pagar_venc,
                                 'documentos', v_pagar_docs,  'dias', v_dpo),
    'inventario', jsonb_build_object('valor', v_inv, 'lotes', v_lotes),
    'capital_trabajo', v_cobrar + v_inv - v_pagar,

    'series', jsonb_build_object(
      'mensual', (
        select coalesce(jsonb_agg(m order by m->>'mes'), '[]'::jsonb) from (
          select jsonb_build_object(
                   'mes', mes,
                   'ingresos', coalesce(sum(ingresos),0),
                   'costo',    coalesce(sum(costo),0),
                   'margen',   coalesce(sum(ingresos - costo),0),
                   'gastos',   coalesce(sum(gastos),0),
                   'resultado',coalesce(sum(ingresos - costo - gastos),0)) as m
            from (
              select to_char(date_trunc('month', o.order_date), 'YYYY-MM') as mes,
                     o.total as ingresos, o.cost_total as costo, 0::numeric as gastos
                from public.orders o
               where o.company_id = p_company and o.status <> 'cancelado'
                 and o.order_date::date between p_desde and p_hasta
              union all
              select to_char(date_trunc('month', coalesce(f.occurred_at, f.created_at::date)), 'YYYY-MM'),
                     0, 0, f.amount
                from public.finance_entries f
               where f.company_id = p_company and f.kind = 'expense'
                 and coalesce(f.occurred_at, f.created_at::date) between p_desde and p_hasta
            ) u
           group by mes) s),

      'caja', (
        select coalesce(jsonb_agg(m order by m->>'mes'), '[]'::jsonb) from (
          select jsonb_build_object(
                   'mes', to_char(date_trunc('month', pa.paid_at), 'YYYY-MM'),
                   'cobros', coalesce(sum(pa.amount) filter (where pa.direction='cobro'),0),
                   'pagos',  coalesce(sum(pa.amount) filter (where pa.direction='pago'),0),
                   'neto',   coalesce(sum(case when pa.direction='cobro' then pa.amount else -pa.amount end),0)) as m
            from public.payments pa
           where pa.company_id = p_company
             and pa.paid_at::date between p_desde and p_hasta
           group by date_trunc('month', pa.paid_at)) s)),

    'aging_cobros', (
      select coalesce(jsonb_agg(t order by t->>'orden'), '[]'::jsonb) from (
        select jsonb_build_object('orden', tr.orden, 'tramo', tr.nombre,
                 'monto', coalesce(sum(d.saldo),0), 'documentos', count(d.saldo)) as t
          from (values (1,'Por vencer',-100000,0), (2,'1 a 30 días',0,30),
                       (3,'31 a 60 días',30,60), (4,'61 a 90 días',60,90),
                       (5,'Más de 90 días',90,100000)) as tr(orden,nombre,desde,hasta)
          left join (
            select (o.total - o.amount_paid) as saldo,
                   (current_date - coalesce(o.due_date, o.order_date::date)) as edad
              from public.orders o
             where o.company_id = p_company and o.status <> 'cancelado'
               and o.total > o.amount_paid
            union all
            select (r.amount - r.amount_paid),
                   (current_date - coalesce(r.due_date, r.issued_at))
              from public.opening_receivables r
             where r.company_id = p_company and r.amount > r.amount_paid
          ) d on d.edad > tr.desde and d.edad <= tr.hasta
         group by tr.orden, tr.nombre) s),

    'aging_pagos', (
      select coalesce(jsonb_agg(t order by t->>'orden'), '[]'::jsonb) from (
        select jsonb_build_object('orden', tr.orden, 'tramo', tr.nombre,
                 'monto', coalesce(sum(d.saldo),0), 'documentos', count(d.saldo)) as t
          from (values (1,'Por vencer',-100000,0), (2,'1 a 30 días',0,30),
                       (3,'31 a 60 días',30,60), (4,'61 a 90 días',60,90),
                       (5,'Más de 90 días',90,100000)) as tr(orden,nombre,desde,hasta)
          left join (
            select (p.total - p.amount_paid) as saldo,
                   (current_date - coalesce(p.due_date, p.purchase_date)) as edad
              from public.purchases p
             where p.company_id = p_company and p.status = 'recibida'
               and p.total > p.amount_paid
            union all
            select (a.amount - a.amount_paid),
                   (current_date - coalesce(a.due_date, a.issued_at))
              from public.opening_payables a
             where a.company_id = p_company and a.amount > a.amount_paid
          ) d on d.edad > tr.desde and d.edad <= tr.hasta
         group by tr.orden, tr.nombre) s),

    'clientes', (
      select coalesce(jsonb_agg(c), '[]'::jsonb) from (
        select jsonb_build_object(
                 'nombre', cu.name,
                 'ventas', sum(o.total),
                 'margen', sum(o.total - o.cost_total),
                 'margen_pct', case when sum(o.total) > 0
                                    then round(sum(o.total - o.cost_total) / sum(o.total) * 100, 1) end,
                 'participacion', case when v_ingresos > 0
                                       then round(sum(o.total) / v_ingresos * 100, 1) else 0 end,
                 'deuda', coalesce(sum(o.total - o.amount_paid), 0),
                 'pedidos', count(*)) as c
          from public.orders o
          join public.customers cu on cu.id = o.customer_id
         where o.company_id = p_company and o.status <> 'cancelado'
           and o.order_date::date between p_desde and p_hasta
         group by cu.id, cu.name
         order by sum(o.total) desc
         limit 12) s),

    'productos', (
      select coalesce(jsonb_agg(p), '[]'::jsonb) from (
        select jsonb_build_object(
                 'nombre', pr.name,
                 'unidades', sum(oi.quantity_ordered),
                 'ventas',  sum(oi.line_total),
                 'costo',   sum(oi.quantity_ordered * coalesce(oi.unit_cost,0)),
                 'margen',  sum(oi.line_total - oi.quantity_ordered * coalesce(oi.unit_cost,0)),
                 'margen_pct', case when sum(oi.line_total) > 0
                                    then round((sum(oi.line_total - oi.quantity_ordered * coalesce(oi.unit_cost,0))
                                                / sum(oi.line_total)) * 100, 1) end) as p
          from public.order_items oi
          join public.orders o    on o.id = oi.order_id
          join public.products pr on pr.id = oi.product_id
         where oi.company_id = p_company and o.status <> 'cancelado'
           and o.order_date::date between p_desde and p_hasta
         group by pr.id, pr.name
         order by sum(oi.line_total) desc
         limit 12) s),

    'gastos', (
      select coalesce(jsonb_agg(g order by (g->>'monto')::numeric desc), '[]'::jsonb) from (
        select jsonb_build_object(
                 'categoria', coalesce(nullif(f.category,''), 'Sin categoría'),
                 'monto', sum(f.amount),
                 'participacion', case when v_gastos > 0
                                       then round(sum(f.amount) / v_gastos * 100, 1) else 0 end,
                 'movimientos', count(*)) as g
          from public.finance_entries f
         where f.company_id = p_company and f.kind = 'expense'
           and coalesce(f.occurred_at, f.created_at::date) between p_desde and p_hasta
         group by coalesce(nullif(f.category,''), 'Sin categoría')) s),

    'alertas', alertas
  );

  return r;
end $function$;

-- ci_modelo_calculado(p_model uuid)
CREATE OR REPLACE FUNCTION public.ci_modelo_calculado(p_model uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  m record; pr record; sc record;
  v_meses jsonb; v_lineas jsonb; v_ind jsonb;
  v_tasa_anual numeric; v_tasa_mes numeric; v_imp numeric;
  v_fcl numeric[];
  v_ing numeric; v_cogs numeric; v_opex numeric; v_dep numeric; v_capex numeric;
  v_ebitda numeric; v_ebit numeric; v_min_caja numeric;
  v_van numeric; v_tir numeric; v_roi numeric;
  v_payback int; v_equilibrio int; v_runway int;
  v_burn numeric; v_meses_burn int;
  v_total_inv numeric;
begin
  select * into m from public.ci_models where id = p_model and deleted_at is null;
  if m is null then return '{}'::jsonb; end if;
  if not public.ci_ve_proyecto(m.project_id) then return '{}'::jsonb; end if;

  select * into pr from public.ci_projects  where id = m.project_id;
  select * into sc from public.ci_scenarios where id = m.scenario_id;

  v_tasa_anual := coalesce(m.discount_rate_pct, 0) / 100.0;
  v_tasa_mes   := case when v_tasa_anual = 0 then 0
                       else power(1 + v_tasa_anual, 1.0/12.0) - 1 end;
  v_imp        := coalesce(m.tax_rate_pct, 0) / 100.0;

  with base as (
    select date_trunc('month', (m.period_start + make_interval(months => g)))::date as periodo
      from generate_series(0, m.period_months - 1) g
  ),
  agg as (
    select b.periodo,
      coalesce(sum(mp.planned_amount) filter (where ml.kind = 'ingreso'), 0)         as ingresos,
      coalesce(sum(mp.planned_amount) filter (where ml.kind = 'costo_directo'), 0)   as cogs,
      coalesce(sum(mp.planned_amount) filter (where ml.kind = 'gasto_operativo'), 0) as opex,
      coalesce(sum(mp.planned_amount) filter (where ml.kind = 'depreciacion'), 0)    as depreciacion,
      coalesce(sum(mp.planned_amount) filter (where ml.kind = 'inversion'), 0)       as capex
      from base b
      left join public.ci_model_periods mp on mp.period = b.periodo and mp.model_id = p_model
      left join public.ci_model_lines   ml on ml.id = mp.line_id
     group by b.periodo
  ),
  calc as (
    select a.*,
      a.ingresos - a.cogs                                as margen_bruto,
      a.ingresos - a.cogs - a.opex                       as ebitda,
      a.ingresos - a.cogs - a.opex - a.depreciacion      as ebit,
      greatest(a.ingresos - a.cogs - a.opex - a.depreciacion, 0) * v_imp as impuesto
      from agg a
  ),
  flujo as (
    select c.*,
      c.ebitda - c.impuesto                        as fco,
      c.ebitda - c.impuesto - c.capex              as fcl,
      coalesce(m.opening_cash, 0)
        + sum(c.ebitda - c.impuesto - c.capex) over (order by c.periodo
              rows between unbounded preceding and current row) as caja_acumulada,
      row_number() over (order by c.periodo) as n
      from calc c
  )
  select jsonb_agg(jsonb_build_object(
           'periodo', to_char(periodo, 'YYYY-MM'),
           'ingresos', ingresos, 'cogs', cogs, 'margen_bruto', margen_bruto,
           'margen_pct', case when ingresos > 0 then round(margen_bruto / ingresos * 100, 1) end,
           'opex', opex, 'ebitda', ebitda,
           'ebitda_pct', case when ingresos > 0 then round(ebitda / ingresos * 100, 1) end,
           'depreciacion', depreciacion, 'ebit', ebit, 'impuesto', round(impuesto, 2),
           'capex', capex, 'fco', round(fco, 2), 'fcl', round(fcl, 2),
           'caja_acumulada', round(caja_acumulada, 2)) order by periodo),
         array_agg(round(fcl, 2) order by periodo),
         sum(ingresos), sum(cogs), sum(opex), sum(depreciacion), sum(capex),
         sum(ebitda), sum(ebit), min(caja_acumulada),
         min(n) filter (where ebitda >= 0 and ingresos > 0),
         min(n) filter (where caja_acumulada < 0),
         -sum(fcl) filter (where fcl < 0), count(*) filter (where fcl < 0)
    into v_meses, v_fcl, v_ing, v_cogs, v_opex, v_dep, v_capex,
         v_ebitda, v_ebit, v_min_caja, v_equilibrio, v_runway, v_burn, v_meses_burn
    from flujo;

  if v_meses is null then return '{}'::jsonb; end if;

  select jsonb_agg(x order by x->>'kind', (x->>'sort')::int, x->>'name') into v_lineas from (
    select jsonb_build_object(
      'id', l.id, 'kind', l.kind, 'category', l.category, 'name', l.name,
      'unidad', bu.name, 'unidad_id', l.business_unit_id,
      'driver', l.driver, 'quantity', l.quantity, 'unit_price', l.unit_price,
      'amount', l.amount, 'pct', l.pct, 'growth_pct', l.growth_pct,
      'frequency', l.frequency, 'sort', l.sort,
      'total', coalesce((select sum(planned_amount) from public.ci_model_periods
                          where line_id = l.id), 0),
      'meses', coalesce((select jsonb_object_agg(to_char(period,'YYYY-MM'),
                                jsonb_build_object('monto', planned_amount,
                                                   'cantidad', quantity,
                                                   'precio', unit_price,
                                                   'origen', source))
                           from public.ci_model_periods where line_id = l.id), '{}'::jsonb)) x
      from public.ci_model_lines l
      left join public.ci_business_units bu on bu.id = l.business_unit_id
     where l.model_id = p_model) t;

  select min(i) into v_payback from (
    select i, sum(v_fcl[j]) as acum
      from generate_series(1, coalesce(array_length(v_fcl,1),0)) i,
           lateral generate_series(1, i) j
     group by i) t
   where acum >= 0;

  v_total_inv := v_capex + greatest(coalesce(-v_min_caja, 0), 0);
  v_van := public.ci_van(v_fcl, v_tasa_mes);
  v_tir := public.ci_tir(v_fcl);
  v_roi := case when v_total_inv > 0
                then round((coalesce(v_ebitda,0) - coalesce(v_capex,0)) / v_total_inv * 100, 1) end;

  v_ind := jsonb_build_array(
    public.ci_indicador('ingresos', 'Ingresos proyectados', v_ing, 'dinero',
      'Suma de todas las líneas de tipo Ingreso en el horizonte',
      jsonb_build_array(public.ci_insumo('Meses del horizonte', m.period_months, 'numero'),
                        public.ci_insumo('Líneas de ingreso',
                          (select count(*) from public.ci_model_lines where model_id=p_model and kind='ingreso'), 'numero'))),

    public.ci_indicador('cogs', 'Costo de ventas', v_cogs, 'dinero',
      'Suma de las líneas de tipo Costo directo',
      jsonb_build_array(public.ci_insumo('Líneas de costo directo',
                          (select count(*) from public.ci_model_lines where model_id=p_model and kind='costo_directo'), 'numero'))),

    public.ci_indicador('margen_bruto', 'Margen bruto', v_ing - v_cogs, 'dinero',
      'Ingresos − Costo de ventas',
      jsonb_build_array(public.ci_insumo('Ingresos', v_ing, 'dinero'),
                        public.ci_insumo('Costo de ventas', v_cogs, 'dinero'))),

    public.ci_indicador('margen_pct', 'Margen bruto %',
      case when v_ing > 0 then round((v_ing - v_cogs) / v_ing * 100, 1) end, 'porcentaje',
      'Margen bruto ÷ Ingresos × 100',
      jsonb_build_array(public.ci_insumo('Margen bruto', v_ing - v_cogs, 'dinero'),
                        public.ci_insumo('Ingresos', v_ing, 'dinero'))),

    public.ci_indicador('ebitda', 'EBITDA', v_ebitda, 'dinero',
      'Ingresos − Costo de ventas − Gastos operativos',
      jsonb_build_array(public.ci_insumo('Ingresos', v_ing, 'dinero'),
                        public.ci_insumo('Costo de ventas', v_cogs, 'dinero'),
                        public.ci_insumo('Gastos operativos', v_opex, 'dinero'))),

    public.ci_indicador('ebitda_pct', 'Margen EBITDA',
      case when v_ing > 0 then round(v_ebitda / v_ing * 100, 1) end, 'porcentaje',
      'EBITDA ÷ Ingresos × 100',
      jsonb_build_array(public.ci_insumo('EBITDA', v_ebitda, 'dinero'),
                        public.ci_insumo('Ingresos', v_ing, 'dinero'))),

    public.ci_indicador('ebit', 'EBIT', v_ebit, 'dinero',
      'EBITDA − Depreciación',
      jsonb_build_array(public.ci_insumo('EBITDA', v_ebitda, 'dinero'),
                        public.ci_insumo('Depreciación', v_dep, 'dinero'))),

    public.ci_indicador('capex', 'Inversión (CAPEX)', v_capex, 'dinero',
      'Suma de las líneas de tipo Inversión',
      jsonb_build_array(public.ci_insumo('Líneas de inversión',
                          (select count(*) from public.ci_model_lines where model_id=p_model and kind='inversion'), 'numero'))),

    public.ci_indicador('necesidad_capital', 'Necesidad acumulada de capital',
      greatest(coalesce(-v_min_caja, 0), 0), 'dinero',
      'El punto más bajo de la caja acumulada, en negativo. Es lo que hay que poner para no quebrar por el camino',
      jsonb_build_array(public.ci_insumo('Saldo inicial declarado', m.opening_cash, 'dinero'),
                        public.ci_insumo('Caja acumulada mínima', v_min_caja, 'dinero'))),

    public.ci_indicador('burn_rate', 'Burn rate mensual',
      case when v_meses_burn > 0 then round(v_burn / v_meses_burn, 2) end, 'dinero',
      'Promedio de la salida neta de caja en los meses en que el flujo libre es negativo',
      jsonb_build_array(public.ci_insumo('Caja consumida', v_burn, 'dinero'),
                        public.ci_insumo('Meses con flujo negativo', v_meses_burn, 'numero'))),

    public.ci_indicador('runway', 'Runway',
      case when v_runway is null then null else v_runway - 1 end, 'meses',
      'Meses hasta que la caja acumulada se vuelve negativa. Si nunca ocurre, el proyecto se sostiene solo',
      jsonb_build_array(public.ci_insumo('Saldo inicial declarado', m.opening_cash, 'dinero'),
                        public.ci_insumo('Primer mes en rojo', v_runway, 'numero'))),

    public.ci_indicador('punto_equilibrio', 'Punto de equilibrio', v_equilibrio, 'meses',
      'Primer mes con EBITDA no negativo e ingresos mayores que cero',
      jsonb_build_array(public.ci_insumo('Mes', v_equilibrio, 'numero'))),

    public.ci_indicador('payback', 'Payback', v_payback, 'meses',
      'Primer mes en que el flujo de caja libre acumulado deja de ser negativo',
      jsonb_build_array(public.ci_insumo('Inversión total', v_total_inv, 'dinero'))),

    public.ci_indicador('roi', 'ROI proyectado', v_roi, 'porcentaje',
      '(EBITDA acumulado − CAPEX) ÷ Inversión total × 100',
      jsonb_build_array(public.ci_insumo('EBITDA acumulado', v_ebitda, 'dinero'),
                        public.ci_insumo('CAPEX', v_capex, 'dinero'),
                        public.ci_insumo('Inversión total', v_total_inv, 'dinero'))),

    public.ci_indicador('van', 'VAN / NPV',
      case when m.discount_rate_pct is null then null else v_van end, 'dinero',
      'Σ flujo libre del mes ÷ (1 + tasa mensual)^mes. La tasa anual se mensualiza con (1+r)^(1/12)−1',
      jsonb_build_array(public.ci_insumo('Tasa de descuento anual', m.discount_rate_pct, 'porcentaje'),
                        public.ci_insumo('Tasa mensual equivalente', round(v_tasa_mes * 100, 4), 'porcentaje'),
                        public.ci_insumo('Meses', m.period_months, 'numero'))),

    public.ci_indicador('tir', 'TIR / IRR',
      case when v_tir is null then null else round((power(1 + v_tir, 12) - 1) * 100, 2) end, 'porcentaje',
      'Tasa que hace VAN = 0, calculada mensual por bisección y anualizada con (1+i)^12−1',
      jsonb_build_array(public.ci_insumo('TIR mensual',
                          case when v_tir is null then null else round(v_tir * 100, 4) end, 'porcentaje'),
                        public.ci_insumo('Flujos considerados', coalesce(array_length(v_fcl,1),0), 'numero')))
  );

  return jsonb_build_object(
    'modelo', jsonb_build_object(
       'id', m.id, 'version', m.version, 'label', m.label, 'estado', m.state,
       'moneda', m.currency, 'inicio', to_char(m.period_start,'YYYY-MM'),
       'meses', m.period_months, 'saldo_inicial', m.opening_cash,
       'tasa_descuento', m.discount_rate_pct, 'tasa_impuesto', m.tax_rate_pct,
       'validado_en', m.validated_at, 'creado_en', m.created_at),
    'proyecto',  jsonb_build_object('id', pr.id, 'nombre', pr.name, 'codigo', pr.code,
                                    'moneda', pr.currency, 'estado', pr.status),
    'escenario', jsonb_build_object('id', sc.id, 'nombre', sc.name, 'tipo', sc.kind,
                                    'supuestos', sc.assumptions),
    'meses', v_meses,
    'lineas', coalesce(v_lineas, '[]'::jsonb),
    'indicadores', v_ind);
end $function$;

-- ci_nueva_version(p_model uuid, p_label text)
CREATE OR REPLACE FUNCTION public.ci_nueva_version(p_model uuid, p_label text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare m record; l record; v_nuevo uuid; v_linea uuid; v_version int;
begin
  select * into m from public.ci_models where id = p_model and deleted_at is null;
  if m is null then raise exception 'El modelo no existe'; end if;
  if not public.ci_edita_proyecto(m.project_id) then
    raise exception 'No tienes permiso para editar este proyecto';
  end if;

  select coalesce(max(version), 0) + 1 into v_version
    from public.ci_models where scenario_id = m.scenario_id;

  insert into public.ci_models
    (company_id, project_id, scenario_id, version, label, currency, period_start,
     period_months, opening_cash, discount_rate_pct, tax_rate_pct, state, notes, created_by)
  values (m.company_id, m.project_id, m.scenario_id, v_version,
          coalesce(p_label, 'Versión ' || v_version), m.currency, m.period_start,
          m.period_months, m.opening_cash, m.discount_rate_pct, m.tax_rate_pct,
          'borrador', m.notes, (select auth.uid()))
  returning id into v_nuevo;

  for l in select * from public.ci_model_lines where model_id = p_model order by sort, name loop
    insert into public.ci_model_lines
      (company_id, project_id, model_id, business_unit_id, kind, category, name,
       driver, quantity, unit_price, amount, pct, growth_pct, frequency,
       start_offset, notes, sort, custom)
    values (l.company_id, l.project_id, v_nuevo, l.business_unit_id, l.kind, l.category, l.name,
            l.driver, l.quantity, l.unit_price, l.amount, l.pct, l.growth_pct, l.frequency,
            l.start_offset, l.notes, l.sort, l.custom)
    returning id into v_linea;

    insert into public.ci_model_periods
      (company_id, project_id, model_id, line_id, period, planned_amount,
       quantity, unit_price, source, note)
    select mp.company_id, mp.project_id, v_nuevo, v_linea, mp.period, mp.planned_amount,
           mp.quantity, mp.unit_price, mp.source, mp.note
      from public.ci_model_periods mp where mp.line_id = l.id;
  end loop;

  return v_nuevo;
end $function$;

-- ci_presupuesto_vs_real(p_project uuid, p_model uuid, p_desde date, p_hasta date)
CREATE OR REPLACE FUNCTION public.ci_presupuesto_vs_real(p_project uuid, p_model uuid DEFAULT NULL::uuid, p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  m record; v_original uuid; v_warn numeric; v_crit numeric;
  v_filas jsonb; v_meses jsonb; v_tot jsonb; v_hoy date := date_trunc('month', current_date)::date;
begin
  if not public.ci_ve_proyecto(p_project) then return '{}'::jsonb; end if;
  select * into m from public.ci_models
   where id = coalesce(p_model, public.ci_modelo_vigente(p_project)) and deleted_at is null;
  if m is null then return '{}'::jsonb; end if;

  -- El presupuesto ORIGINAL es la versión 1 del mismo escenario: lo
  -- que se aprobó antes de que la realidad opinara.
  select id into v_original from public.ci_models
   where scenario_id = m.scenario_id and deleted_at is null
   order by version asc limit 1;

  select warn_pct, critical_pct into v_warn, v_crit
    from public.ci_thresholds
   where company_id = m.company_id and kind = 'general';
  v_warn := coalesce(v_warn, 10); v_crit := coalesce(v_crit, 20);

  p_desde := coalesce(p_desde, m.period_start);
  p_hasta := coalesce(p_hasta, (m.period_start + make_interval(months => m.period_months - 1))::date);

  with meses as (
    select date_trunc('month', d)::date as periodo
      from generate_series(date_trunc('month', p_desde), date_trunc('month', p_hasta), interval '1 month') d
  ),
  cats as (
    select distinct kind, category from (
      select kind, category from public.ci_model_lines where model_id = m.id
      union
      select kind, category from public.ci_actuals
       where project_id = p_project and period between p_desde and p_hasta) u
  ),
  celda as (
    select ms.periodo, c.kind, c.category,
      coalesce((select sum(mp.planned_amount) from public.ci_model_periods mp
                 join public.ci_model_lines ml on ml.id = mp.line_id
                where mp.model_id = v_original and mp.period = ms.periodo
                  and ml.kind = c.kind and ml.category = c.category), 0) as original,
      coalesce((select sum(mp.planned_amount) from public.ci_model_periods mp
                 join public.ci_model_lines ml on ml.id = mp.line_id
                where mp.model_id = m.id and mp.period = ms.periodo
                  and ml.kind = c.kind and ml.category = c.category), 0) as vigente,
      coalesce((select sum(committed_amount) from public.ci_actuals
                where project_id = p_project and period = ms.periodo
                  and kind = c.kind and category = c.category), 0) as comprometido,
      coalesce((select sum(paid_amount) from public.ci_actuals
                where project_id = p_project and period = ms.periodo
                  and kind = c.kind and category = c.category), 0) as pagado,
      coalesce((select sum(actual_amount) from public.ci_actuals
                where project_id = p_project and period = ms.periodo
                  and kind = c.kind and category = c.category), 0) as real
      from meses ms cross join cats c
  ),
  resumen as (
    select kind, category,
      sum(original) as original, sum(vigente) as vigente,
      sum(comprometido) as comprometido, sum(pagado) as pagado, sum(real) as real,
      sum(real) - sum(vigente) as diferencia,
      case when sum(vigente) <> 0 then round(sum(real) / sum(vigente) * 100, 1) end as pct_ejecutado,
      sum(real) filter (where periodo <= v_hoy)
        + sum(vigente) filter (where periodo > v_hoy) as proyeccion_cierre
      from celda group by kind, category
  )
  select jsonb_agg(jsonb_build_object(
           'kind', kind, 'categoria', category,
           'original', original, 'vigente', vigente,
           'comprometido', comprometido, 'pagado', pagado, 'real', real,
           'diferencia', diferencia, 'pct_ejecutado', pct_ejecutado,
           'proyeccion_cierre', proyeccion_cierre,
           'semaforo', case
             when vigente = 0 and real = 0 then 'neutro'
             when vigente = 0 then 'malo'
             when abs(diferencia) / abs(nullif(vigente,0)) * 100 >= v_crit then 'malo'
             when abs(diferencia) / abs(nullif(vigente,0)) * 100 >= v_warn then 'aviso'
             else 'ok' end)
           order by kind, category)
    into v_filas from resumen;

  with meses as (
    select date_trunc('month', d)::date as periodo
      from generate_series(date_trunc('month', p_desde), date_trunc('month', p_hasta), interval '1 month') d
  )
  select jsonb_agg(jsonb_build_object(
           'periodo', to_char(ms.periodo, 'YYYY-MM'),
           'vigente', coalesce((select sum(planned_amount) from public.ci_model_periods
                                 where model_id = m.id and period = ms.periodo), 0),
           'real', coalesce((select sum(actual_amount) from public.ci_actuals
                              where project_id = p_project and period = ms.periodo), 0))
           order by ms.periodo)
    into v_meses from meses ms;

  select jsonb_build_object(
    'original', coalesce(sum((x->>'original')::numeric), 0),
    'vigente',  coalesce(sum((x->>'vigente')::numeric), 0),
    'comprometido', coalesce(sum((x->>'comprometido')::numeric), 0),
    'pagado', coalesce(sum((x->>'pagado')::numeric), 0),
    'real', coalesce(sum((x->>'real')::numeric), 0),
    'diferencia', coalesce(sum((x->>'diferencia')::numeric), 0))
    into v_tot from jsonb_array_elements(coalesce(v_filas,'[]'::jsonb)) x;

  return jsonb_build_object(
    'modelo', jsonb_build_object('id', m.id, 'version', m.version, 'label', m.label,
                                 'estado', m.state, 'moneda', m.currency),
    'original_id', v_original,
    'umbrales', jsonb_build_object('aviso', v_warn, 'critico', v_crit),
    'desde', to_char(p_desde,'YYYY-MM'), 'hasta', to_char(p_hasta,'YYYY-MM'),
    'filas', coalesce(v_filas, '[]'::jsonb),
    'meses', coalesce(v_meses, '[]'::jsonb),
    'totales', v_tot);
end $function$;

-- ci_resumen(p_company uuid, p_filtros jsonb)
CREATE OR REPLACE FUNCTION public.ci_resumen(p_company uuid, p_filtros jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_moneda text; v_desde date; v_hasta date; v_hoy date := date_trunc('month', current_date)::date;
  v_cifras jsonb; v_series jsonb; v_listas jsonb; v_alertas jsonb := '[]'::jsonb;
  v_solicitado numeric; v_comprometido numeric; v_utilizado numeric;
  v_ing_proy numeric; v_ing_real numeric; v_ebitda numeric;
  v_presu numeric; v_real numeric;
  v_proyectos int; v_activos int; v_riesgo int; v_sin_tasa int; v_sin_modelo int;
  v_warn numeric; v_crit numeric; v_desv numeric; v_movimientos int;
begin
  if not public.has_company_level(p_company, 40) then return '{}'::jsonb; end if;

  select currency into v_moneda from public.companies where id = p_company;
  v_desde := coalesce((p_filtros->>'desde')::date, date_trunc('month', current_date - interval '11 months')::date);
  v_hasta := coalesce((p_filtros->>'hasta')::date, date_trunc('month', current_date + interval '11 months')::date);

  select warn_pct, critical_pct into v_warn, v_crit
    from public.ci_thresholds where company_id = p_company and kind = 'general';
  v_warn := coalesce(v_warn, 10); v_crit := coalesce(v_crit, 20);

  select coalesce(sum(public.ci_convertir(p_company, capital_required,  currency, v_moneda)), 0),
         coalesce(sum(public.ci_convertir(p_company, capital_committed, currency, v_moneda)), 0),
         count(*),
         count(*) filter (where status not in ('cerrado','rechazado','pausado','borrador')),
         count(*) filter (where risk_level = 'alto' or status = 'pausado'),
         count(*) filter (where currency <> v_moneda
                            and public.ci_convertir(p_company, 1, currency, v_moneda) is null),
         count(*) filter (where modelo is null)
    into v_solicitado, v_comprometido, v_proyectos, v_activos, v_riesgo, v_sin_tasa, v_sin_modelo
    from public.ci_proyectos_filtrados(p_company, p_filtros);

  select coalesce(sum(public.ci_convertir(p_company, a.paid_amount, a.currency, v_moneda, a.period)), 0)
    into v_utilizado
    from public.ci_actuals a
    join public.ci_proyectos_filtrados(p_company, p_filtros) t on t.id = a.project_id
   where a.kind = 'inversion'
     and (p_filtros->>'unidad' is null or a.business_unit_id = (p_filtros->>'unidad')::uuid);

  select coalesce(sum(public.ci_convertir(p_company, a.actual_amount, a.currency, v_moneda, a.period))
                  filter (where a.kind = 'ingreso'), 0),
         coalesce(sum(public.ci_convertir(p_company, a.actual_amount, a.currency, v_moneda, a.period))
                  filter (where a.kind = 'ingreso'), 0)
       - coalesce(sum(public.ci_convertir(p_company, a.actual_amount, a.currency, v_moneda, a.period))
                  filter (where a.kind in ('costo_directo','gasto_operativo')), 0),
         coalesce(sum(public.ci_convertir(p_company, a.actual_amount, a.currency, v_moneda, a.period))
                  filter (where a.kind <> 'inversion'), 0)
    into v_ing_real, v_ebitda, v_real
    from public.ci_actuals a
    join public.ci_proyectos_filtrados(p_company, p_filtros) t on t.id = a.project_id
   where a.period between v_desde and least(v_hasta, v_hoy)
     and (p_filtros->>'unidad' is null or a.business_unit_id = (p_filtros->>'unidad')::uuid);

  select coalesce(sum(public.ci_convertir(p_company, mp.planned_amount, t.currency, v_moneda, mp.period))
                  filter (where ml.kind = 'ingreso'), 0),
         coalesce(sum(public.ci_convertir(p_company, mp.planned_amount, t.currency, v_moneda, mp.period))
                  filter (where ml.kind <> 'inversion'), 0)
    into v_ing_proy, v_presu
    from public.ci_model_periods mp
    join public.ci_model_lines ml on ml.id = mp.line_id
    join public.ci_proyectos_filtrados(p_company, p_filtros) t on t.modelo = mp.model_id
   where mp.period between v_desde and least(v_hasta, v_hoy)
     and (p_filtros->>'unidad' is null or ml.business_unit_id = (p_filtros->>'unidad')::uuid);

  v_desv := case when coalesce(v_movimientos, 0) = 0 then null
                  when v_presu <> 0 then round((v_real - v_presu) / abs(v_presu) * 100, 1) end;

  -- Cada tarjeta viaja con su fórmula y sus insumos, igual que los
  -- indicadores del modelo. Es el mismo objeto que devuelve
  -- `ci_indicador()`, más lo que la tarjeta necesita para pintarse
  -- —tono y nota—, de modo que una cifra del panel se puede abrir y
  -- leer de qué está hecha sin que nadie la recalcule al explicarla.
  v_cifras := jsonb_build_array(
    public.ci_indicador('capital_solicitado','Capital solicitado', v_solicitado,'dinero',
      'Suma de «capital requerido» de los proyectos del filtro, convertido a ' || v_moneda,
      jsonb_build_array(public.ci_insumo('Proyectos en el filtro', v_proyectos,'numero'))),

    public.ci_indicador('capital_comprometido','Capital comprometido', v_comprometido,'dinero',
      'Suma de «capital captado» de los mismos proyectos',
      jsonb_build_array(public.ci_insumo('Capital solicitado', v_solicitado,'dinero')))
      || jsonb_build_object('nota', case when v_solicitado > 0
           then round(v_comprometido / v_solicitado * 100)::text || '% del objetivo' end),

    public.ci_indicador('capital_pendiente','Capital pendiente',
      greatest(v_solicitado - v_comprometido, 0),'dinero',
      'Capital solicitado − capital comprometido',
      jsonb_build_array(public.ci_insumo('Solicitado', v_solicitado,'dinero'),
                        public.ci_insumo('Comprometido', v_comprometido,'dinero')))
      || jsonb_build_object('tono','aviso'),

    public.ci_indicador('capital_utilizado','Capital utilizado', v_utilizado,'dinero',
      'Suma de lo PAGADO en movimientos reales de naturaleza Inversión',
      jsonb_build_array(public.ci_insumo('Comprometido', v_comprometido,'dinero'))),

    public.ci_indicador('capital_disponible','Capital disponible',
      v_comprometido - v_utilizado,'dinero',
      'Capital comprometido − capital utilizado',
      jsonb_build_array(public.ci_insumo('Comprometido', v_comprometido,'dinero'),
                        public.ci_insumo('Utilizado', v_utilizado,'dinero'))),

    public.ci_indicador('ingresos_proyectados','Ingresos proyectados', v_ing_proy,'dinero',
      'Celdas de ingreso del modelo vigente de cada proyecto, hasta el mes en curso',
      jsonb_build_array(public.ci_insumo('Proyectos sin modelo', v_sin_modelo,'numero')))
      || jsonb_build_object('nota','hasta el mes en curso'),

    public.ci_indicador('ingresos_reales','Ingresos reales', v_ing_real,'dinero',
      'Movimientos reales de naturaleza Ingreso, hasta el mes en curso',
      jsonb_build_array(public.ci_insumo('Proyectado en el mismo tramo', v_ing_proy,'dinero')))
      || jsonb_build_object('nota', case when v_ing_proy > 0
           then round(v_ing_real / v_ing_proy * 100)::text || '% de lo proyectado' end),

    public.ci_indicador('ebitda_real','EBITDA real', v_ebitda,'dinero',
      'Ingresos reales − costos directos reales − gastos operativos reales',
      jsonb_build_array(public.ci_insumo('Ingresos reales', v_ing_real,'dinero'),
                        public.ci_insumo('Costos y gastos reales', v_ing_real - v_ebitda,'dinero'))),

    public.ci_indicador('margen_ebitda','Margen EBITDA',
      case when v_ing_real > 0 then round(v_ebitda / v_ing_real * 100, 1) else 0 end,'porcentaje',
      'EBITDA real ÷ ingresos reales × 100',
      jsonb_build_array(public.ci_insumo('EBITDA real', v_ebitda,'dinero'),
                        public.ci_insumo('Ingresos reales', v_ing_real,'dinero'))),

    public.ci_indicador('desviacion','Desviación presupuestaria', v_desv,'porcentaje',
      '(real − presupuesto vigente) ÷ presupuesto vigente × 100, solo sobre meses ya cerrados',
      jsonb_build_array(public.ci_insumo('Real', v_real,'dinero'),
                        public.ci_insumo('Presupuesto vigente', v_presu,'dinero'),
                        public.ci_insumo('Umbral de aviso', v_warn,'porcentaje'),
                        public.ci_insumo('Umbral crítico', v_crit,'porcentaje')))
      || jsonb_build_object(
           'nota', case when coalesce(v_movimientos,0) = 0 then 'todavía no hay ejecución cargada'
                        else 'real contra presupuesto vigente' end,
           'tono', case when v_desv is null then null
                        when abs(v_desv) >= v_crit then 'malo'
                        when abs(v_desv) >= v_warn then 'aviso' else 'ok' end),

    public.ci_indicador('proyectos_activos','Proyectos activos', v_activos,'numero',
      'Proyectos del filtro que no están en borrador, pausado, cerrado ni rechazado',
      jsonb_build_array(public.ci_insumo('Proyectos en el filtro', v_proyectos,'numero'))),

    public.ci_indicador('proyectos_riesgo','Proyectos en riesgo', v_riesgo,'numero',
      'Proyectos con riesgo declarado Alto o en estado Pausado',
      jsonb_build_array(public.ci_insumo('Proyectos activos', v_activos,'numero')))
      || jsonb_build_object('tono','malo')
  );

  select jsonb_build_array(
    jsonb_build_object('titulo','Ingresos: proyectado contra real',
      'nota','El presupuesto del modelo vigente de cada proyecto, contra lo que se cargó como ejecución.',
      'formato','dinero','leyenda', jsonb_build_array('Proyectado','Real'),
      'puntos', coalesce((select jsonb_agg(jsonb_build_object('x', mes, 'y', proy, 'y2', rea,
                                                              'formato_x','mes') order by mes)
        from (
          select to_char(d,'YYYY-MM') as mes,
            coalesce((select sum(public.ci_convertir(p_company, mp.planned_amount, t.currency, v_moneda, mp.period))
                        from public.ci_model_periods mp
                        join public.ci_model_lines ml on ml.id = mp.line_id
                        join public.ci_proyectos_filtrados(p_company, p_filtros) t on t.modelo = mp.model_id
                       where ml.kind = 'ingreso' and mp.period = d::date), 0) as proy,
            coalesce((select sum(public.ci_convertir(p_company, a.actual_amount, a.currency, v_moneda, a.period))
                        from public.ci_actuals a
                        join public.ci_proyectos_filtrados(p_company, p_filtros) t on t.id = a.project_id
                       where a.kind = 'ingreso' and a.period = d::date), 0) as rea
            from generate_series(date_trunc('month', v_desde), date_trunc('month', v_hasta), interval '1 month') d
        ) s), '[]'::jsonb)))
    into v_series;

  select jsonb_build_array(
    jsonb_build_object('titulo','Proyectos','nota','De aquí salen las cifras de capital de arriba.',
      'columnas', jsonb_build_array(
        jsonb_build_object('k','proyecto','t','Proyecto'),
        jsonb_build_object('k','estado','t','Estado'),
        jsonb_build_object('k','moneda','t','Moneda'),
        jsonb_build_object('k','solicitado','t','Solicitado','formato','dinero'),
        jsonb_build_object('k','captado','t','Captado','formato','dinero'),
        jsonb_build_object('k','avance','t','% captado','formato','porcentaje'),
        jsonb_build_object('k','riesgo','t','Riesgo')),
      'filas', coalesce((select jsonb_agg(jsonb_build_object(
                  'proyecto', name, 'estado', status, 'moneda', currency,
                  'solicitado', public.ci_convertir(p_company, capital_required, currency, v_moneda),
                  'captado',    public.ci_convertir(p_company, capital_committed, currency, v_moneda),
                  'avance', case when capital_required > 0
                                 then round(capital_committed / capital_required * 100, 1) else 0 end,
                  'riesgo', risk_level) order by capital_required desc)
                from public.ci_proyectos_filtrados(p_company, p_filtros)), '[]'::jsonb)),

    jsonb_build_object('titulo','Próximos hitos','nota','Lo que viene en los siguientes 90 días.',
      'columnas', jsonb_build_array(
        jsonb_build_object('k','hito','t','Hito'),
        jsonb_build_object('k','proyecto','t','Proyecto'),
        jsonb_build_object('k','fecha','t','Fecha','formato','fecha'),
        jsonb_build_object('k','monto','t','Capital que libera','formato','dinero')),
      'filas', coalesce((select jsonb_agg(jsonb_build_object(
                  'hito', h.name, 'proyecto', t.name, 'fecha', h.due_date,
                  'monto', public.ci_convertir(p_company, h.amount_conditioned, t.currency, v_moneda))
                  order by h.due_date)
                from public.ci_milestones h
                join public.ci_proyectos_filtrados(p_company, p_filtros) t on t.id = h.project_id
               where h.deleted_at is null and h.status <> 'hecho'
                 and h.due_date between current_date and current_date + 90), '[]'::jsonb)))
    into v_listas;

  if v_sin_tasa > 0 then
    v_alertas := v_alertas || public.ci_aviso('sin_tipo_de_cambio','bloqueante',
      v_sin_tasa || ' proyecto(s) sin tipo de cambio a ' || v_moneda,
      'Sus cifras no entran en el consolidado. Carga la tasa en Tipos de cambio para que sumen.');
  end if;
  if v_sin_modelo > 0 then
    v_alertas := v_alertas || public.ci_aviso('sin_modelo','aviso',
      v_sin_modelo || ' proyecto(s) sin modelo financiero',
      'Aparecen en el capital pero no en las proyecciones: no tienen ni un escenario con líneas.');
  end if;
  if coalesce(v_movimientos,0) = 0 and v_presu > 0 then
    v_alertas := v_alertas || public.ci_aviso('sin_ejecucion','aviso',
      'Todavía no hay ejecución real cargada',
      'Hay presupuesto para meses que ya cerraron y ningún movimiento contra el cual compararlo. No es una desviación: es que falta cargar lo que pasó.');
  end if;
  if v_desv is not null and abs(v_desv) >= v_crit then
    v_alertas := v_alertas || public.ci_aviso('desviacion_critica','bloqueante',
      'Desviación presupuestaria de ' || v_desv || '%',
      'La ejecución real se separó del presupuesto vigente más allá del umbral crítico de la organización (' || v_crit || '%).');
  end if;
  if v_comprometido > v_solicitado and v_solicitado > 0 then
    v_alertas := v_alertas || public.ci_aviso('capital_excedido','bloqueante',
      'El capital captado supera al solicitado',
      'Revisa los montos comprometidos: alguno está cargado de más.');
  end if;

  return jsonb_build_object(
    'moneda', v_moneda,
    'periodo', jsonb_build_object('desde', to_char(v_desde,'YYYY-MM'), 'hasta', to_char(v_hasta,'YYYY-MM')),
    'umbrales', jsonb_build_object('aviso', v_warn, 'critico', v_crit),
    'cifras', v_cifras, 'series', v_series, 'listas', v_listas, 'alertas', v_alertas);
end $function$;

-- ci_tir(p_flujos numeric[])
CREATE OR REPLACE FUNCTION public.ci_tir(p_flujos numeric[])
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare lo numeric := -0.999999; hi numeric := 1.0; mid numeric;
        v numeric; v_lo numeric; n int; i int;
begin
  n := coalesce(array_length(p_flujos, 1), 0);
  if n < 2 then return null; end if;
  if not (exists (select 1 from unnest(p_flujos) f where f > 0)
      and exists (select 1 from unnest(p_flujos) f where f < 0)) then
    return null;
  end if;

  v_lo := public.ci_van(p_flujos, lo);
  if v_lo * public.ci_van(p_flujos, hi) > 0 then return null; end if;

  for i in 1..120 loop
    mid := (lo + hi) / 2;
    v := public.ci_van(p_flujos, mid);
    exit when abs(v) < 0.01;
    if (v > 0) = (v_lo > 0) then lo := mid; v_lo := v; else hi := mid; end if;
  end loop;
  return round(mid, 8);
end $function$;

-- ci_validar_modelo(p_model uuid)
CREATE OR REPLACE FUNCTION public.ci_validar_modelo(p_model uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  m record; pr record; sc record; a jsonb := '[]'::jsonb;
  v_ing int; v_opex int; v_dep int; v_lineas int;
  v_capex numeric; v_dupla record; v_post numeric; v_equity numeric;
  v_sin_fx int; v_monto_plano int;
begin
  select * into m from public.ci_models where id = p_model and deleted_at is null;
  if m is null then return '[]'::jsonb; end if;
  if not public.ci_ve_proyecto(m.project_id) then return '[]'::jsonb; end if;
  select * into pr from public.ci_projects  where id = m.project_id;
  select * into sc from public.ci_scenarios where id = m.scenario_id;

  select count(*) filter (where kind='ingreso'),
         count(*) filter (where kind='gasto_operativo'),
         count(*) filter (where kind='depreciacion'),
         count(*),
         coalesce(sum(amount) filter (where kind='inversion'), 0),
         count(*) filter (where kind='ingreso' and driver='monto')
    into v_ing, v_opex, v_dep, v_lineas, v_capex, v_monto_plano
    from public.ci_model_lines where model_id = p_model;

  -- 1 · sin líneas no hay proyección
  if v_lineas = 0 then
    a := a || public.ci_aviso('sin_lineas','bloqueante','El modelo no tiene ninguna línea',
      'Una proyección vacía no puede validarse. Agrega al menos una fuente de ingreso y sus costos.');
  end if;

  -- 2 · ingresos proyectados sin unidades ni precios
  if v_ing = 0 and v_lineas > 0 then
    a := a || public.ci_aviso('sin_ingresos','bloqueante','No hay ninguna línea de ingreso',
      'El modelo solo tiene costos. Sin ingresos no hay margen, ni payback, ni TIR que calcular.');
  elsif v_monto_plano > 0 then
    a := a || public.ci_aviso('ingreso_sin_unidades','aviso',
      v_monto_plano || ' línea(s) de ingreso son un monto suelto',
      'Un ingreso declarado como monto no dice cuántas unidades ni a qué precio. Es la cifra que un inversionista pide desglosar primero.');
  end if;

  -- 3 · proyección sin costos indirectos · margen presentado como utilidad
  if v_ing > 0 and v_opex = 0 then
    a := a || public.ci_aviso('sin_gastos_operativos','bloqueante','La proyección no tiene gastos operativos',
      'Sin personal, arriendo ni administración, el EBITDA que muestra esta proyección es en realidad el margen bruto. Son cosas distintas.');
  end if;
  if v_ing > 0 and v_dep = 0 and v_capex > 0 then
    a := a || public.ci_aviso('capex_sin_depreciacion','aviso','Hay inversión y no hay depreciación',
      'Con CAPEX pero sin depreciación, el EBIT es igual al EBITDA y el resultado del proyecto se ve mejor de lo que es.');
  end if;

  -- 4 · flujo de caja sin saldo inicial
  if m.opening_cash is null then
    a := a || public.ci_aviso('sin_saldo_inicial','bloqueante','Falta el saldo inicial de caja',
      'Sin saldo de apertura, el flujo acumulado empieza en cero y la necesidad de capital sale mal. Declara con cuánto parte el proyecto, aunque sea 0.');
  end if;

  -- 5 · escenario sin periodo ni supuestos definidos
  if sc.assumptions = '{}'::jsonb then
    a := a || public.ci_aviso('escenario_sin_supuestos','aviso','El escenario no declara sus supuestos',
      'Un escenario sin supuestos escritos no se puede comparar con otro ni defender ante un tercero.');
  end if;
  if m.label is null or btrim(m.label) = '' then
    a := a || public.ci_aviso('version_sin_nombre','aviso','Esta versión no tiene nombre',
      'Las versiones sin etiqueta se vuelven indistinguibles en cuanto hay tres.');
  end if;

  -- 6 · dos precios distintos para lo mismo
  for v_dupla in
    select name, count(distinct unit_price) as precios
      from public.ci_model_lines
     where model_id = p_model and kind = 'ingreso' and unit_price is not null
     group by name having count(distinct unit_price) > 1
  loop
    a := a || public.ci_aviso('precio_inconsistente','bloqueante',
      'Dos precios distintos para «' || v_dupla.name || '»',
      'La misma fuente de ingreso aparece con ' || v_dupla.precios || ' precios diferentes en el mismo modelo. Uno de los dos está mal.');
  end loop;

  -- 7 · costos compartidos contabilizados dos veces
  for v_dupla in
    select name, category, count(*) as veces
      from public.ci_model_lines
     where model_id = p_model and kind in ('costo_directo','gasto_operativo')
     group by name, category having count(*) > 1
  loop
    a := a || public.ci_aviso('costo_duplicado','aviso',
      '«' || v_dupla.name || '» aparece ' || v_dupla.veces || ' veces',
      'Un costo compartido cargado a varias unidades se suma tantas veces como aparezca. Revisa si es el mismo gasto contado dos veces.');
  end loop;

  -- 8 · valoración, equity y capital
  v_post := pr.post_money;
  if pr.pre_money is not null and pr.capital_required > 0 then
    if v_post is null then
      a := a || public.ci_aviso('sin_post_money','aviso','Falta la valoración post-money',
        'Con pre-money y capital declarados, la post-money debería ser ' ||
        to_char(pr.pre_money + pr.capital_required, 'FM999999999999.00') || '.');
    elsif abs(v_post - (pr.pre_money + pr.capital_required)) > 0.01 then
      a := a || public.ci_aviso('valoracion_incoherente','bloqueante','La valoración no cuadra',
        'Post-money declarada: ' || to_char(v_post,'FM999999999999.00') ||
        '. Pre-money + inversión: ' || to_char(pr.pre_money + pr.capital_required,'FM999999999999.00') || '.');
    end if;
  end if;
  if pr.pre_money is not null and m.discount_rate_pct is null then
    a := a || public.ci_aviso('valoracion_sin_metodologia','aviso','La valoración no tiene metodología detrás',
      'Hay una pre-money declarada pero el modelo no define tasa de descuento, así que no hay VAN con el que respaldarla.');
  end if;
  if v_post is not null and v_post > 0 and pr.equity_offered_pct is not null then
    v_equity := round(pr.capital_required / v_post * 100, 2);
    if abs(pr.equity_offered_pct - v_equity) > 0.5 then
      a := a || public.ci_aviso('equity_incoherente','bloqueante','El equity ofrecido no calza con la valoración',
        'Ofrecido: ' || pr.equity_offered_pct || '%. Inversión ÷ post-money da ' || v_equity || '%.');
    end if;
  end if;
  if pr.capital_committed > pr.capital_required and pr.capital_required > 0 then
    a := a || public.ci_aviso('capital_excedido','bloqueante','El capital captado supera al objetivo',
      'Captado: ' || to_char(pr.capital_committed,'FM999999999999.00') ||
      ' sobre un objetivo de ' || to_char(pr.capital_required,'FM999999999999.00') || '.');
  end if;

  -- 9 · tipo de cambio ausente
  select count(*) into v_sin_fx from public.ci_actuals
   where project_id = m.project_id and currency <> m.currency and fx_rate is null;
  if v_sin_fx > 0 then
    a := a || public.ci_aviso('sin_tipo_de_cambio','bloqueante',
      v_sin_fx || ' movimiento(s) en otra moneda sin tipo de cambio',
      'Hay ejecución real en una moneda distinta a la del modelo y sin tasa registrada. Esas cifras no se pueden consolidar.');
  end if;

  return a;
end $function$;

-- ci_validar_ronda(p_round uuid)
CREATE OR REPLACE FUNCTION public.ci_validar_ronda(p_round uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r record; a jsonb := '[]'::jsonb;
  v_conf numeric; v_uof numeric; v_uof_n int; v_equity numeric; v_dif numeric;
begin
  select * into r from public.ci_capital_rounds where id = p_round and deleted_at is null;
  if r is null then return '[]'::jsonb; end if;
  if not public.ci_ve_proyecto(r.project_id) then return '[]'::jsonb; end if;

  select coalesce(sum(greatest(committed_amount, invested_amount)), 0)
    into v_conf from public.ci_investor_commitments where round_id = p_round;
  select coalesce(sum(budget_amount), 0), count(*)
    into v_uof, v_uof_n from public.ci_use_of_funds where round_id = p_round;

  -- valoración
  if r.pre_money is not null and r.target_amount > 0 then
    if r.post_money is null then
      a := a || public.ci_aviso('sin_post_money','aviso','Falta la valoración post-money',
        'Con pre-money y objetivo declarados, la post-money debería ser ' ||
        to_char(r.pre_money + r.target_amount,'FM999999999999.00') || '.');
    elsif abs(r.post_money - (r.pre_money + r.target_amount)) > 0.01 then
      a := a || public.ci_aviso('valoracion_incoherente','bloqueante','La valoración no cuadra',
        'Post-money declarada: ' || to_char(r.post_money,'FM999999999999.00') ||
        '. Pre-money + objetivo: ' || to_char(r.pre_money + r.target_amount,'FM999999999999.00') || '.');
    end if;
  end if;

  if r.post_money is not null and r.post_money > 0 and r.equity_offered_pct is not null then
    v_equity := round(r.target_amount / r.post_money * 100, 2);
    if abs(r.equity_offered_pct - v_equity) > 0.5 then
      a := a || public.ci_aviso('equity_incoherente','bloqueante','El equity ofrecido no calza con la valoración',
        'Ofrecido: ' || r.equity_offered_pct || '%. Objetivo ÷ post-money da ' || v_equity || '%.');
    end if;
  end if;

  -- capital
  if v_conf > r.target_amount and r.target_amount > 0 then
    a := a || public.ci_aviso('capital_excedido','bloqueante','Lo confirmado supera al objetivo',
      'Confirmado ' || to_char(v_conf,'FM999999999999.00') || ' sobre un objetivo de ' ||
      to_char(r.target_amount,'FM999999999999.00') || '. O sube el objetivo, o sobra un compromiso.');
  end if;

  -- uso de fondos
  if v_uof_n = 0 then
    a := a || public.ci_aviso('sin_uso_de_fondos','aviso','La ronda no dice en qué se va a usar el dinero',
      'Es la primera pregunta de cualquier inversionista, y sin el desglose no hay contra qué medir la ejecución después.');
  else
    v_dif := v_uof - r.target_amount;
    if abs(v_dif) > greatest(r.target_amount * 0.01, 1) then
      a := a || public.ci_aviso('uso_de_fondos_descuadrado','bloqueante',
        'El uso de fondos no suma el objetivo',
        'Reparte ' || to_char(v_uof,'FM999999999999.00') || ' sobre un objetivo de ' ||
        to_char(r.target_amount,'FM999999999999.00') || ': ' ||
        case when v_dif > 0 then 'sobran ' else 'faltan ' end ||
        to_char(abs(v_dif),'FM999999999999.00') || '.');
    end if;
  end if;

  -- proceso
  if r.status = 'abierta' and r.target_close_date is null then
    a := a || public.ci_aviso('sin_fecha_de_cierre','aviso','La ronda está abierta y no tiene fecha objetivo de cierre',
      'Una ronda sin fecha no se cierra: se apaga.');
  end if;
  if r.status = 'cerrada' and v_conf < r.target_amount then
    a := a || public.ci_aviso('cerrada_incompleta','aviso','La ronda está cerrada por debajo del objetivo',
      'Confirmado ' || to_char(v_conf,'FM999999999999.00') || ' de ' ||
      to_char(r.target_amount,'FM999999999999.00') || '. Conviene dejar dicho por qué.');
  end if;

  if exists (select 1 from public.ci_investor_commitments
              where round_id = p_round and stage in ('comprometido','cerrado')
                and greatest(committed_amount, invested_amount) = 0) then
    a := a || public.ci_aviso('comprometido_sin_monto','aviso','Hay compromisos sin monto',
      'Un inversionista marcado como comprometido y con cero no suma al capital confirmado.');
  end if;

  return a;
end $function$;

-- client_leads_completar()
CREATE OR REPLACE FUNCTION public.client_leads_completar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_tel text;
begin
  if new.full_name is null then
    new.full_name := coalesce(
      public.lead_respuesta(new.answers, array['full_name','nombre_completo','nombre_y_apellido','nombre_y_apellidos','name']),
      nullif(btrim(concat_ws(' ',
        public.lead_respuesta(new.answers, array['first_name','nombre','nombre_de_pila']),
        public.lead_respuesta(new.answers, array['last_name','apellido','apellidos']))), ''));
  end if;
  if new.phone is null then
    new.phone := public.lead_respuesta(new.answers, array['phone_number','phone','numero_de_telefono','telefono',
      'numero_de_celular','celular','whatsapp','numero_de_whatsapp','movil','numero_de_movil']);
  end if;
  if new.email is null then
    new.email := public.lead_respuesta(new.answers, array['email','correo_electronico','correo','e_mail','work_email','mail']);
  end if;
  if new.client_id is null and coalesce(new.status, 'nuevo') <> 'descartado'
     and new.full_name is not null and (new.phone is not null or new.email is not null) then
    begin
      v_tel := public.tel_normal(new.phone);
      select c.id into v_id from public.clients c
       where c.alma_id = new.alma_id
         and ((v_tel <> '' and public.tel_normal(c.phone) = v_tel)
           or (new.email is not null and lower(c.email) = lower(new.email)))
       order by c.created_at limit 1;
      if v_id is null then
        insert into public.clients (alma_id, name, phone, email, kind, notes)
        values (new.alma_id, new.full_name, new.phone, new.email, 'cliente',
                concat_ws(E'\n',
                  'Cliente potencial · ' || coalesce(new.campaign_name, 'anuncio de Meta'),
                  case when new.city is not null then 'Muro: ' || new.city end,
                  case when new.measures is not null then 'Medidas: ' || new.measures end,
                  case when new.idea is not null then 'Idea: ' || new.idea end))
        returning id into v_id;
      end if;
      new.client_id := v_id;
    exception when others then
      null;
    end;
  end if;
  return new;
end; $function$;

-- company_module_allowed(p_company uuid, p_module text)
CREATE OR REPLACE FUNCTION public.company_module_allowed(p_company uuid, p_module text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select p_module = 'core' or exists (
    select 1
    from public.company_modules cm
    join public.modules  m on m.id = cm.module_id and m.slug = p_module
    join public.subscriptions s on s.company_id = cm.company_id
                               and s.status in ('prueba','activa','morosa')
    join public.plan_modules pm on pm.plan_id = s.plan_id and pm.module_id = m.id
    where cm.company_id = p_company and cm.enabled
  );
$function$;

-- crear_cliente(p_nombre text, p_slug text, p_plan text, p_linea text, p_mensualidad bigint)
CREATE OR REPLACE FUNCTION public.crear_cliente(p_nombre text, p_slug text, p_plan text, p_linea text DEFAULT 'company'::text, p_mensualidad bigint DEFAULT NULL::bigint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_company uuid; v_plan public.plans; v_linea uuid; v_precio bigint;
begin
  if not public.is_platform_admin() then
    raise exception 'Solo la plataforma da de alta clientes';
  end if;

  if coalesce(trim(p_nombre),'') = '' then raise exception 'El cliente necesita un nombre'; end if;
  if p_slug !~ '^[a-z][a-z0-9-]{1,38}$' then
    raise exception 'El identificador debe ser minusculas, numeros y guiones: "%"', p_slug;
  end if;
  if exists (select 1 from public.companies where slug = p_slug) then
    raise exception 'Ya existe un cliente con el identificador "%"', p_slug;
  end if;

  select * into v_plan from public.plans where slug = p_plan and active;
  if v_plan.id is null then raise exception 'No existe el plan "%"', p_plan; end if;

  select id into v_linea from public.product_lines where slug = p_linea and active;
  if v_linea is null then raise exception 'No existe la linea "%"', p_linea; end if;

  v_precio := coalesce(p_mensualidad, v_plan.price_amount);

  insert into public.companies (name, slug, status, country, currency, timezone, locale,
                                product_line_id, tenant_type, created_by)
  values (trim(p_nombre), p_slug, 'trial', 'CL', 'CLP', 'America/Santiago', 'es',
          v_linea, 'operator', null)
  returning id into v_company;

  insert into public.subscriptions (company_id, plan_id, status, price_amount, currency, billing_cycle,
                                    trial_ends_at)
  values (v_company, v_plan.id, 'prueba', v_precio, 'CLP', 'mensual',
          case when v_plan.trial_days > 0 then now() + (v_plan.trial_days || ' days')::interval end);

  insert into public.company_modules (company_id, module_id, enabled)
  select v_company, pm.module_id, true
  from public.plan_modules pm where pm.plan_id = v_plan.id
  on conflict (company_id, module_id) do nothing;

  insert into public.audit_logs (company_id, user_id, action, entity, entity_id, metadata)
  values (v_company, (select auth.uid()), 'ALTA_CLIENTE', 'companies', v_company::text,
          jsonb_build_object('plan', p_plan, 'linea', p_linea, 'mensualidad', v_precio));

  return v_company;
end $function$;

-- estado_clientes()
CREATE OR REPLACE FUNCTION public.estado_clientes()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case when not public.is_platform_admin() then '[]'::jsonb else
    coalesce((
      select jsonb_agg(x order by x->>'empresa')
        from (
          select jsonb_build_object(
            'company_id', c.id,
            'empresa',    c.name,
            'slug',       c.slug,
            'estado',     c.status,
            'linea',      pl.name,
            'linea_slug', pl.slug,
            'plan',       p.name,
            'suscripcion', s.status::text,
            'desde',      s.started_at,
            'usuarios', (select count(*) from company_members m
                          where m.company_id = c.id and m.status = 'active'),
            'usuarios_plan', p.max_users,
            'ultima_actividad', (select max(a.created_at) from audit_logs a where a.company_id = c.id),
            'acciones_7d', (select count(*) from audit_logs a
                             where a.company_id = c.id and a.created_at >= now() - interval '7 days'),
            'datos', jsonb_build_object(
              'clientes',  (select count(*) from customers cu where cu.company_id = c.id),
              'productos', (select count(*) from products pr where pr.company_id = c.id),
              'pedidos',   (select count(*) from orders o where o.company_id = c.id),
              'pedidos_30d', (select count(*) from orders o
                               where o.company_id = c.id and o.order_date >= now() - interval '30 days')),
            'modulos', (select count(*) from company_modules cm
                         where cm.company_id = c.id and cm.enabled),
            'modulos_plan', (select count(*) from plan_modules pm where pm.plan_id = p.id),
            'fuera_del_plan', (select count(*) from company_modules cm
                                where cm.company_id = c.id and cm.enabled
                                  and not exists (select 1 from plan_modules pm
                                                   where pm.plan_id = p.id and pm.module_id = cm.module_id)),
            'levantamiento', coalesce((
              select case when ss.applied_at is not null then 'aplicado'
                          when ss.submitted_at is not null then 'enviado'
                          else 'abierto' end
                from survey_sessions ss
               where ss.company_id = c.id
               order by ss.created_at desc limit 1), 'sin abrir')
          ) as x
          from companies c
          left join subscriptions s on s.company_id = c.id
          left join plans p on p.id = s.plan_id
          left join product_lines pl on pl.id = p.product_line_id
        ) t), '[]'::jsonb)
  end;
$function$;

-- exigir_cupo()
CREATE OR REPLACE FUNCTION public.exigir_cupo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_clave  text := TG_ARGV[0];
  v_nombre text := TG_ARGV[1];
  v_tope   bigint;
  v_uso    bigint;
begin
  if NEW.company_id is null then return NEW; end if;
  v_tope := public.tope_del_plan(NEW.company_id, v_clave);
  if v_tope is null then return NEW; end if;
  v_uso := public.uso_del_plan(NEW.company_id, v_clave);
  if v_uso >= v_tope then
    raise exception 'Tu plan incluye hasta % % y ya los tienes. Subir de plan levanta el tope sin migrar nada.',
                    v_tope, v_nombre
      using errcode = '45000',
            detail  = format('cuota=%s;tope=%s;uso=%s', v_clave, v_tope, v_uso),
            hint    = 'CUPO_AGOTADO';
  end if;
  return NEW;
end $function$;

-- guardar_ficha_empresa(p_company uuid, p_ficha jsonb)
CREATE OR REPLACE FUNCTION public.guardar_ficha_empresa(p_company uuid, p_ficha jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_nombre text := nullif(btrim(p_ficha->>'nombre'), '');
  v_resto  jsonb;
begin
  if not public.has_company_level(p_company, 80) then
    raise exception 'Solo un administrador puede cambiar la ficha de la empresa';
  end if;

  update public.companies
     set name     = coalesce(v_nombre, name),
         currency = coalesce(nullif(p_ficha->>'moneda', ''), currency),
         country  = coalesce(nullif(p_ficha->>'pais',   ''), country),
         timezone = coalesce(nullif(p_ficha->>'zona',   ''), timezone),
         updated_at = now()
   where id = p_company;

  v_resto := (p_ficha - 'nombre' - 'moneda' - 'pais' - 'zona' - 'estado' - 'linea');

  insert into public.company_config (company_id, key, value, description)
  values (p_company, 'ficha', v_resto, 'Datos comerciales de la empresa')
  on conflict (company_id, key) do update
     set value = excluded.value, updated_at = now();

  return public.ficha_empresa(p_company);
end;
$function$;

-- guardar_marca(p_company uuid, p_logo_url text, p_color text)
CREATE OR REPLACE FUNCTION public.guardar_marca(p_company uuid, p_logo_url text DEFAULT NULL::text, p_color text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_marca jsonb;
begin
  if not public.has_company_level(p_company, 80) then
    raise exception 'No tienes permiso para cambiar la marca de esta organización';
  end if;

  if p_color is not null and p_color !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'El color debe venir como #rrggbb';
  end if;

  update public.companies
     set branding = coalesce(branding, '{}'::jsonb)
                  || jsonb_build_object('logo_url', p_logo_url, 'color', p_color)
   where id = p_company
   returning branding into v_marca;

  return v_marca;
end;
$function$;

-- handle_new_user()
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_name text := coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1));
  v_country text := nullif(new.raw_user_meta_data->>'country','');
  v_rank integer; v_council boolean := false; v_alma uuid;
begin
  if new.raw_user_meta_data->>'origen' = 'company' then
    return new;
  end if;

  if exists (
    select 1 from public.user_invitations i
     where lower(i.email) = lower(new.email)
       and i.used_at is null
       and i.expires_at > now()
  ) then
    return new;
  end if;

  select count(*) into v_rank from public.almas where coalesce(is_founding,false) = false;
  v_council := (v_rank < 50);
  insert into public.almas (user_id, name, role, level, xp, essence, affinity, country, council, bio)
  values (new.id, v_name, 'Creador', 'EMBER', 0, 0,
    nullif(new.raw_user_meta_data->>'affinity',''), v_country, v_council,
    'Una nueva Alma en ANIMA. Aquí empieza tu trayectoria.')
  returning id into v_alma;
  insert into public.soul_timeline (user_id, event_type, title, description)
  values (new.id, 'despertar', 'Tu Alma despertó.', 'Bienvenida a ANIMA.');
  insert into public.soul_badges (user_id, code) values (new.id, 'explorador') on conflict do nothing;
  if v_council then
    insert into public.soul_badges (user_id, code) values (new.id, 'alma_fundadora') on conflict do nothing;
  end if;
  insert into public.echoes (alma_id, alma_name, country, kind, text)
  values (v_alma, split_part(v_name,' ',1), v_country, 'despertar',
          '✦ ' || split_part(v_name,' ',1) || ' despertó' || coalesce(' en ' || v_country, ''));
  return new;
end;
$function$;

-- informe_ventas(p_company uuid, p_desde date, p_hasta date)
CREATE OR REPLACE FUNCTION public.informe_ventas(p_company uuid, p_desde date DEFAULT (CURRENT_DATE - 180), p_hasta date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case when not public.has_company_level(p_company, 40) then '{}'::jsonb else
    jsonb_build_object(
      'resumen', (
        select jsonb_build_object(
          'ventas',   coalesce(sum(o.total), 0),
          'costo',    coalesce(sum(o.cost_total), 0),
          'margen',   coalesce(sum(o.total - o.cost_total), 0),
          'pedidos',  count(*),
          'ticket',   case when count(*) = 0 then 0
                           else round(coalesce(sum(o.total), 0) / count(*)) end,
          'cobrado',  coalesce(sum(o.amount_paid), 0),
          'por_cobrar', coalesce(sum(o.total - o.amount_paid), 0))
        from public.orders o
       where o.company_id = p_company
         and o.status <> 'cancelado'
         and o.order_date::date between p_desde and p_hasta),

      'por_mes', (
        select coalesce(jsonb_agg(m order by m->>'mes'), '[]'::jsonb) from (
          select jsonb_build_object(
                   'mes',     to_char(date_trunc('month', o.order_date), 'YYYY-MM'),
                   'ventas',  sum(o.total),
                   'margen',  sum(o.total - o.cost_total),
                   'pedidos', count(*)) as m
            from public.orders o
           where o.company_id = p_company
             and o.status <> 'cancelado'
             and o.order_date::date between p_desde and p_hasta
           group by date_trunc('month', o.order_date)) s),

      'top_clientes', (
        select coalesce(jsonb_agg(c), '[]'::jsonb) from (
          select jsonb_build_object(
                   'nombre',  cu.name,
                   'ventas',  sum(o.total),
                   'pedidos', count(*)) as c
            from public.orders o
            join public.customers cu on cu.id = o.customer_id
           where o.company_id = p_company
             and o.status <> 'cancelado'
             and o.order_date::date between p_desde and p_hasta
           group by cu.id, cu.name
           order by sum(o.total) desc
           limit 10) s),

      'top_productos', (
        select coalesce(jsonb_agg(p), '[]'::jsonb) from (
          select jsonb_build_object(
                   'nombre',   pr.name,
                   'cantidad', sum(oi.quantity_ordered),
                   'ventas',   sum(oi.line_total)) as p
            from public.order_items oi
            join public.orders o   on o.id = oi.order_id
            join public.products pr on pr.id = oi.product_id
           where oi.company_id = p_company
             and o.status <> 'cancelado'
             and o.order_date::date between p_desde and p_hasta
           group by pr.id, pr.name
           order by sum(oi.line_total) desc
           limit 10) s),

      -- La antigüedad de la deuda: no es lo mismo deber hace tres días que
      -- hace tres meses, y el total solo no lo dice.
      'cobranza', (
        select coalesce(jsonb_agg(t order by t->>'orden'), '[]'::jsonb) from (
          select jsonb_build_object(
                   'orden', tramo.orden,
                   'tramo', tramo.nombre,
                   'monto', coalesce(sum(o.total - o.amount_paid), 0),
                   'documentos', count(o.id)) as t
            from (values (1, 'Por vencer',    -100000, 0),
                         (2, '1 a 30 días',        0, 30),
                         (3, '31 a 60 días',      30, 60),
                         (4, '61 a 90 días',      60, 90),
                         (5, 'Más de 90 días',    90, 100000)) as tramo(orden, nombre, desde, hasta)
            left join public.orders o
              on o.company_id = p_company
             and o.status <> 'cancelado'
             and o.total > o.amount_paid
             and (current_date - coalesce(o.due_date, o.order_date::date)) > tramo.desde
             and (current_date - coalesce(o.due_date, o.order_date::date)) <= tramo.hasta
           group by tramo.orden, tramo.nombre) s),

      'inventario', (
        select jsonb_build_object(
          'lotes',      count(*),
          'valor',      coalesce(sum(l.quantity_on_hand * l.unit_cost), 0),
          'por_vencer', count(*) filter (where l.expires_at is not null
                                           and l.expires_at <= current_date + 7))
        from public.inventory_lots l
       where l.company_id = p_company and l.status = 'disponible')
    )
  end;
$function$;

-- is_company_member(p_company uuid)
CREATE OR REPLACE FUNCTION public.is_company_member(p_company uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (select 1 from public.company_members cm
    where cm.company_id = p_company and cm.user_id = (select auth.uid()) and cm.status = 'active'); $function$;

-- mis_lineas()
CREATE OR REPLACE FUNCTION public.mis_lineas()
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(array_agg(distinct linea), '{}'::text[])
    from (
      select pl.slug as linea
        from public.company_members m
        join public.companies    c  on c.id  = m.company_id
        join public.subscriptions s  on s.company_id = c.id
        join public.plans        p  on p.id  = s.plan_id
        join public.product_lines pl on pl.id = p.product_line_id
       where m.user_id = (select auth.uid())
         and m.status  = 'active'
         and s.status in ('prueba', 'activa', 'morosa')
         and pl.active
      union
      select 'studio'
        from public.almas a
       where a.user_id = (select auth.uid())
    ) t;
$function$;

-- panel_inicio(p_company uuid)
CREATE OR REPLACE FUNCTION public.panel_inicio(p_company uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case when not public.has_company_level(p_company, 40) then '{}'::jsonb else
    jsonb_build_object(

      'hoy', (
        select jsonb_build_object(
          'ventas',   coalesce(sum(o.total) filter (where o.order_date::date = current_date), 0),
          'pedidos',  count(*) filter (where o.order_date::date = current_date),
          'entregados', count(*) filter (where o.delivered_at::date = current_date),
          'en_reparto', count(*) filter (where o.status = 'en_reparto'),
          'por_preparar', count(*) filter (where o.status in ('nuevo','confirmado','en_preparacion')),
          'sale_hoy', count(*) filter (where o.delivery_date::date = current_date
                                         and o.status not in ('entregado','cancelado')))
        from public.orders o
       where o.company_id = p_company and o.status <> 'cancelado'),

      'mes', (
        select jsonb_build_object(
          'ventas',   coalesce(sum(o.total)                 filter (where o.order_date >= date_trunc('month', now())), 0),
          'margen',   coalesce(sum(o.total - o.cost_total)  filter (where o.order_date >= date_trunc('month', now())), 0),
          'pedidos',  count(*)                              filter (where o.order_date >= date_trunc('month', now())),
          'ventas_antes', coalesce(sum(o.total) filter (
                            where o.order_date >= date_trunc('month', now()) - interval '1 month'
                              and o.order_date <  date_trunc('month', now()) - interval '1 month'
                                                  + (now() - date_trunc('month', now()))), 0),
          'dia',      extract(day from current_date)::int,
          'dias',     extract(day from (date_trunc('month', now()) + interval '1 month' - interval '1 day'))::int)
        from public.orders o
       where o.company_id = p_company
         and o.status <> 'cancelado'
         and o.order_date >= date_trunc('month', now()) - interval '1 month'),

      'compras_mes', (
        select coalesce(sum(p.total), 0) from public.purchases p
         where p.company_id = p_company and p.status = 'recibida'
           and p.purchase_date >= date_trunc('month', now())::date),

      'cobro', (
        select jsonb_build_object(
          'por_cobrar', coalesce(sum(o.total - o.amount_paid), 0),
          'vencido',    coalesce(sum(o.total - o.amount_paid) filter (where o.due_date < current_date), 0),
          'documentos', count(*),
          'vencidos',   count(*) filter (where o.due_date < current_date))
        from public.orders o
       where o.company_id = p_company and o.status <> 'cancelado'
         and o.payment_status <> 'pagado' and o.total > o.amount_paid),

      'dias', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'dia', d::date, 'ventas', coalesce(v.ventas, 0), 'pedidos', coalesce(v.pedidos, 0))
               order by d), '[]'::jsonb)
          from generate_series(current_date - 29, current_date, interval '1 day') d
          left join (
            select o.order_date::date as f, sum(o.total) ventas, count(*) pedidos
              from public.orders o
             where o.company_id = p_company and o.status <> 'cancelado'
               and o.order_date::date >= current_date - 29
             group by 1) v on v.f = d::date),

      'meses', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'mes', to_char(m, 'YYYY-MM'),
                 'ventas', coalesce(v.ventas, 0),
                 'margen', coalesce(v.margen, 0),
                 'pedidos', coalesce(v.pedidos, 0)) order by m), '[]'::jsonb)
          from generate_series(date_trunc('month', now()) - interval '11 months',
                               date_trunc('month', now()), interval '1 month') m
          left join (
            select date_trunc('month', o.order_date) f,
                   sum(o.total) ventas, sum(o.total - o.cost_total) margen, count(*) pedidos
              from public.orders o
             where o.company_id = p_company and o.status <> 'cancelado'
               and o.order_date >= date_trunc('month', now()) - interval '11 months'
             group by 1) v on v.f = m),

      'pedidos', (
        select coalesce(jsonb_agg(p order by (p->>'orden')::int, p->>'entrega'), '[]'::jsonb) from (
          select jsonb_build_object(
                   'id',      o.id,
                   'codigo',  o.code,
                   'cliente', coalesce(cu.name, 'Sin cliente'),
                   'comuna',  cu.comuna,
                   'estado',  o.status,
                   'pago',    o.payment_status,
                   'entrega', o.delivery_date::date,
                   'total',   o.total,
                   'saldo',   o.total - o.amount_paid,
                   'orden',   case o.status when 'en_reparto' then 1 when 'preparado' then 2
                                            when 'en_preparacion' then 3 when 'confirmado' then 4
                                            else 5 end) as p
            from public.orders o
            left join public.customers cu on cu.id = o.customer_id
           where o.company_id = p_company
             and o.status not in ('entregado','cancelado')
           order by case o.status when 'en_reparto' then 1 when 'preparado' then 2
                                  when 'en_preparacion' then 3 when 'confirmado' then 4
                                  else 5 end,
                    o.delivery_date nulls last
           limit 8) s),

      'stock_critico', (
        select coalesce(jsonb_agg(p order by (p->>'falta')::numeric desc), '[]'::jsonb) from (
          select jsonb_build_object(
                   'nombre',     v.name,
                   'unidad',     v.base_unit,
                   'disponible', v.available,
                   'minimo',     v.min_stock,
                   'falta',      v.min_stock - v.available,
                   'valor',      v.stock_value) as p
            from public.v_product_stock v
           where v.company_id = p_company and v.status = 'activo'
             and v.min_stock > 0 and v.available < v.min_stock
           order by (v.min_stock - v.available) desc
           limit 6) s),

      'por_vencer', (
        select coalesce(jsonb_agg(p order by (p->>'dias')::int), '[]'::jsonb) from (
          select jsonb_build_object(
                   'lote',     l.code,
                   'producto', pr.name,
                   'cantidad', l.quantity_on_hand,
                   'unidad',   l.unit,
                   'vence',    l.expires_at,
                   'dias',     (l.expires_at - current_date),
                   'valor',    l.quantity_on_hand * l.unit_cost) as p
            from public.inventory_lots l
            left join public.products pr on pr.id = l.product_id
           where l.company_id = p_company and l.status = 'disponible'
             and l.expires_at is not null and l.expires_at <= current_date + 7
             and l.quantity_on_hand > 0
           order by l.expires_at
           limit 6) s),

      'cobranza', (
        select coalesce(jsonb_agg(t order by (t->>'orden')::int), '[]'::jsonb) from (
          select jsonb_build_object(
                   'orden', tramo.orden,
                   'tramo', tramo.nombre,
                   'monto', coalesce(sum(o.total - o.amount_paid), 0),
                   'documentos', count(o.id)) as t
            from (values (1, 'Por vencer',    -100000, 0),
                         (2, '1 a 30 días',        0, 30),
                         (3, '31 a 60 días',      30, 60),
                         (4, '61 a 90 días',      60, 90),
                         (5, 'Más de 90 días',    90, 100000)) as tramo(orden, nombre, desde, hasta)
            left join public.orders o
              on o.company_id = p_company
             and o.status <> 'cancelado'
             and o.total > o.amount_paid
             and (current_date - coalesce(o.due_date, o.order_date::date)) >  tramo.desde
             and (current_date - coalesce(o.due_date, o.order_date::date)) <= tramo.hasta
           group by tramo.orden, tramo.nombre) s),

      'mapa', (
        select jsonb_build_object(
          'comunas', (
            select coalesce(jsonb_agg(jsonb_build_object(
                     'comuna',   g.comuna,
                     'region',   g.region,
                     'clientes', g.clientes,
                     'pedidos',  g.pedidos,
                     'ventas',   g.ventas)
                   order by g.ventas desc, g.clientes desc), '[]'::jsonb)
              from (
                select coalesce(nullif(btrim(cu.comuna), ''), 'Sin comuna') as comuna,
                       nullif(btrim(cu.region), '')                        as region,
                       count(distinct cu.id)                               as clientes,
                       count(o.id)                                         as pedidos,
                       coalesce(sum(o.total), 0)                           as ventas
                  from public.customers cu
                  left join public.orders o
                    on o.customer_id = cu.id and o.status <> 'cancelado'
                   and o.order_date >= now() - interval '180 days'
                 where cu.company_id = p_company and cu.status = 'activo'
                 group by 1, 2) g),
          'ubicados', (
            select count(*) from public.customers cu
             where cu.company_id = p_company and cu.status = 'activo'
               and nullif(btrim(cu.region), '') is not null),
          'total', (
            select count(*) from public.customers cu
             where cu.company_id = p_company and cu.status = 'activo'))),

      'generado', now()
    )
  end;
$function$;

-- push_aviso_lead()
CREATE OR REPLACE FUNCTION public.push_aviso_lead()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.source is distinct from 'manual' then
    perform net.http_post(
      url := 'https://jwxeowowuxmijuexdrua.supabase.co/functions/v1/push',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', public.meta_secret_get('meta_leads_cron_key')),
      body := jsonb_build_object('action', 'lead', 'id', new.id),
      timeout_milliseconds := 10000);
  end if;
  return new;
exception when others then
  return new;
end; $function$;

-- rei_clave_persona(p_nombre text, p_contacto text)
CREATE OR REPLACE FUNCTION public.rei_clave_persona(p_nombre text, p_contacto text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  with d as (select regexp_replace(coalesce(p_contacto, ''), '[^0-9]', '', 'g') as t)
  select coalesce(
    nullif(case when length(d.t) = 20 then left(d.t, 10) else d.t end, ''),
    nullif(lower(btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'))), '')
  )
  from d;
$function$;

-- rei_comercial(p_company uuid, p_filtros jsonb)
CREATE OR REPLACE FUNCTION public.rei_comercial(p_company uuid, p_filtros jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  if not public.has_company_level(p_company, 40) then return '{}'::jsonb; end if;

  select currency into v_moneda from public.companies where id = p_company;

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
         and (stage not in ('ganado','perdido')
              or (won_at  >= v_ini and won_at  < v_fin + 1)
              or (lost_at >= v_ini and lost_at < v_fin + 1))
       group by stage) c on c.stage = e.etapa;

  -- ===================== LAS SERIES =====================
  v_series := jsonb_build_array(
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
            and (l.n is not null or vi.n is not null or dg.n is not null
                 or da.ponderado is not null or t.meta is not null)
       ) f),

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
end $function$;

-- rei_mapa(p_company uuid)
CREATE OR REPLACE FUNCTION public.rei_mapa(p_company uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with inm as (
    select coalesce(nullif(btrim(city), ''), 'Sin municipio') as municipio,
           count(*) as inmuebles,
           count(*) filter (where commercial_status = 'disponible') as disponibles,
           count(*) filter (where commercial_status = 'vendido')    as vendidos
      from public.rei_properties
     where company_id = p_company and deleted_at is null
     group by 1
  ), dem as (
    select coalesce(nullif(btrim(city), ''), 'Sin municipio') as municipio,
           count(*) as compradores,
           count(*) filter (where client_status = 'activo') as compradores_activos
      from public.rei_buyers
     where company_id = p_company and deleted_at is null
     group by 1
  ), todo as (
    select coalesce(i.municipio, d.municipio) as municipio,
           coalesce(i.inmuebles, 0)   as inmuebles,
           coalesce(i.disponibles, 0) as disponibles,
           coalesce(i.vendidos, 0)    as vendidos,
           coalesce(d.compradores, 0) as compradores,
           coalesce(d.compradores_activos, 0) as compradores_activos
      from inm i full outer join dem d on d.municipio = i.municipio
  )
  select case when public.has_company_level(p_company, 40)
    then jsonb_build_object(
      'departamento', (select value->>'region' from public.company_config
                        where company_id = p_company and key = 'ficha'),
      'municipios', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'municipio',    t.municipio,
                 'inmuebles',    t.inmuebles,
                 'disponibles',  t.disponibles,
                 'vendidos',     t.vendidos,
                 'compradores',  t.compradores,
                 'compradores_activos', t.compradores_activos)
               order by t.inmuebles + t.compradores desc, t.municipio)
          from todo t), '[]'::jsonb),
      'total_inmuebles',   (select coalesce(sum(inmuebles), 0) from todo),
      'total_compradores', (select coalesce(sum(compradores), 0) from todo))
    else '{}'::jsonb end;
$function$;

-- rei_prefactibilidad(p_feasibility uuid)
CREATE OR REPLACE FUNCTION public.rei_prefactibilidad(p_feasibility uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  f record; d record; v_company uuid; v_moneda text;
  v_area numeric; v_ingresos numeric;
  v_costo_m2 numeric; v_directo numeric; v_indirecto numeric; v_obra numeric;
  v_financiero numeric; v_comercial numeric; v_total numeric; v_utilidad numeric;
  v_margen numeric; v_unidades_eq int;
  v_ind_pct numeric; v_fin_pct numeric; v_com_pct numeric;
  v_tasa numeric; v_eq_pct numeric;
  v_flujos numeric[]; v_periodos int; v_ppa int;
  v_tir_p numeric; v_tir_a numeric; v_van numeric; v_dscr numeric;
  v_sum_in numeric; v_sum_out numeric; v_n_out int;
  v_min_tir numeric; v_min_margen numeric; v_min_dscr numeric;
  v_cifras jsonb; v_flujo jsonb; v_avisos jsonb := '[]'::jsonb;
  v_veredicto text; v_cumple boolean;
begin
  select * into f from public.rei_feasibility where id = p_feasibility and deleted_at is null;
  if f is null then return '{}'::jsonb; end if;
  v_company := f.company_id;
  if not public.has_company_level(v_company, 60) then return '{}'::jsonb; end if;

  select * into d from public.rei_developments where id = f.development_id;
  select currency into v_moneda from public.companies where id = v_company;

  -- Los supuestos: los del modelo si están, los de la organización si
  -- no. El orden importa y es siempre el mismo.
  v_costo_m2 := coalesce(f.direct_cost_m2,
                  public.rei_parametro(v_company,
                    case when lower(f.product) = 'vis' then 'costo_directo_vis'
                         else 'costo_directo_no_vis' end));
  v_ind_pct  := coalesce(f.indirect_pct,   public.rei_parametro(v_company, 'costos_indirectos_pct'));
  v_fin_pct  := coalesce(f.financial_pct,  public.rei_parametro(v_company, 'gastos_financieros_pct'));
  v_com_pct  := coalesce(f.commercial_pct, public.rei_parametro(v_company, 'gastos_comerciales_pct'));
  v_tasa     := coalesce(f.discount_rate,  public.rei_parametro(v_company, 'wacc'));
  v_eq_pct   := coalesce(f.equilibrium_pct,public.rei_parametro(v_company, 'preventas_minimas'));

  v_min_tir    := public.rei_parametro(v_company, 'tir_minima');
  v_min_margen := public.rei_parametro(v_company, 'margen_minimo');
  v_min_dscr   := public.rei_parametro(v_company, 'dscr_minimo');

  -- Cualquier insumo que falte propaga null hasta la pantalla, que
  -- dice «falta un dato» en vez de dibujar un cero.
  v_area       := f.units * f.avg_area_m2;
  v_ingresos   := v_area * f.price_m2;
  v_directo    := v_area * v_costo_m2;
  v_indirecto  := v_directo * v_ind_pct / 100;
  v_obra       := f.land_cost + v_directo + v_indirecto;
  v_financiero := v_obra * v_fin_pct / 100;
  v_comercial  := v_ingresos * v_com_pct / 100;
  v_total      := v_obra + v_financiero + v_comercial;
  v_utilidad   := v_ingresos - v_total;
  v_margen     := case when v_ingresos > 0 then round(v_utilidad / v_ingresos * 100, 2) end;
  v_unidades_eq := case when f.units is not null and v_eq_pct is not null
                        then ceil(f.units * v_eq_pct / 100)::int end;

  -- El flujo. Se carga en positivo y el signo lo pone aquí el vector.
  select array_agg(inflow - outflow order by period_no),
         count(*), coalesce(sum(inflow), 0), coalesce(sum(outflow), 0),
         count(*) filter (where outflow > 0)
    into v_flujos, v_periodos, v_sum_in, v_sum_out, v_n_out
    from public.rei_cashflow_periods where feasibility_id = p_feasibility;

  v_ppa := case f.period_kind when 'mes' then 12 when 'trimestre' then 4
                              when 'semestre' then 2 else 1 end;

  v_tir_p := public.ci_tir(v_flujos);
  v_tir_a := case when v_tir_p is not null
                  then round((power(1 + v_tir_p, v_ppa) - 1) * 100, 2) end;
  v_van   := case when v_flujos is not null and v_tasa is not null
                  then public.ci_van(v_flujos, power(1 + v_tasa/100, 1.0/v_ppa) - 1) end;
  -- Ingresos totales sobre egresos totales, los dos sobre el MISMO
  -- conjunto de periodos.
  v_dscr  := case when v_sum_out > 0 then round(v_sum_in / v_sum_out, 2) end;

  v_cifras := jsonb_build_array(
    public.ci_indicador('area_vendible','Área vendible total', v_area,'numero',
      'Unidades × área vendible promedio por unidad',
      jsonb_build_array(public.ci_insumo('Unidades', f.units,'numero'),
                        public.ci_insumo('Área por unidad (m²)', f.avg_area_m2,'numero'))),

    public.ci_indicador('ingresos','Ingresos por ventas', v_ingresos,'dinero',
      'Área vendible total × precio de venta por m²',
      jsonb_build_array(public.ci_insumo('Área vendible (m²)', v_area,'numero'),
                        public.ci_insumo('Precio por m²', f.price_m2,'dinero'))),

    public.ci_indicador('costo_suelo','Costo del suelo', f.land_cost,'dinero',
      'Lo que cuesta el lote: compra, permuta valorizada o aporte',
      jsonb_build_array()),

    public.ci_indicador('costo_directo','Costo directo de obra', v_directo,'dinero',
      'Área vendible × costo directo de construcción por m² ('
        || case when lower(f.product) = 'vis' then 'VIS' else 'No VIS' end || ')',
      jsonb_build_array(public.ci_insumo('Área vendible (m²)', v_area,'numero'),
                        public.ci_insumo('Costo de obra por m²', v_costo_m2,'dinero'))),

    public.ci_indicador('costo_indirecto','Costos indirectos', v_indirecto,'dinero',
      'Costo directo × % de indirectos (diseño, licencias, interventoría, administración)',
      jsonb_build_array(public.ci_insumo('Costo directo', v_directo,'dinero'),
                        public.ci_insumo('% de indirectos', v_ind_pct,'porcentaje'))),

    public.ci_indicador('gastos_financieros','Gastos financieros', v_financiero,'dinero',
      '(Suelo + directo + indirectos) × % de gastos financieros',
      jsonb_build_array(public.ci_insumo('Suelo + obra', v_obra,'dinero'),
                        public.ci_insumo('% financiero', v_fin_pct,'porcentaje'))),

    public.ci_indicador('gastos_comerciales','Gastos comerciales', v_comercial,'dinero',
      'Ingresos por ventas × % de gastos comerciales (comisiones y mercadeo)',
      jsonb_build_array(public.ci_insumo('Ingresos', v_ingresos,'dinero'),
                        public.ci_insumo('% comercial', v_com_pct,'porcentaje'))),

    public.ci_indicador('costo_total','Costo total del proyecto', v_total,'dinero',
      'Suelo + obra directa + indirectos + gastos financieros + gastos comerciales',
      jsonb_build_array(public.ci_insumo('Suelo + obra', v_obra,'dinero'),
                        public.ci_insumo('Financieros', v_financiero,'dinero'),
                        public.ci_insumo('Comerciales', v_comercial,'dinero'))),

    public.ci_indicador('utilidad','Utilidad del proyecto', v_utilidad,'dinero',
      'Ingresos por ventas − costo total del proyecto',
      jsonb_build_array(public.ci_insumo('Ingresos', v_ingresos,'dinero'),
                        public.ci_insumo('Costo total', v_total,'dinero'))),

    public.ci_indicador('margen','Margen sobre ventas', v_margen,'porcentaje',
      'Utilidad ÷ ingresos por ventas',
      jsonb_build_array(public.ci_insumo('Utilidad', v_utilidad,'dinero'),
                        public.ci_insumo('Ingresos', v_ingresos,'dinero'),
                        public.ci_insumo('Mínimo exigido', v_min_margen,'porcentaje')))
      || jsonb_build_object('tono', case when v_margen is null then null
                                         when v_min_margen is null then 'ok'
                                         when v_margen >= v_min_margen then 'ok' else 'malo' end),

    public.ci_indicador('unidades_equilibrio','Unidades en preventa para el punto de equilibrio',
      v_unidades_eq,'numero',
      'Unidades × % de preventas exigido, redondeado hacia arriba',
      jsonb_build_array(public.ci_insumo('Unidades', f.units,'numero'),
                        public.ci_insumo('% de preventas exigido', v_eq_pct,'porcentaje'))),

    public.ci_indicador('tir','TIR anualizada', v_tir_a,'porcentaje',
      'TIR del flujo por periodo, anualizada: (1 + TIR del periodo)^'
        || v_ppa || ' − 1. Periodo: ' || f.period_kind,
      jsonb_build_array(public.ci_insumo('Periodos cargados', v_periodos,'numero'),
                        public.ci_insumo('TIR del periodo', case when v_tir_p is not null
                                          then round(v_tir_p * 100, 2) end,'porcentaje'),
                        public.ci_insumo('Mínimo exigido', v_min_tir,'porcentaje')))
      || jsonb_build_object('tono', case when v_tir_a is null then null
                                         when v_min_tir is null then 'ok'
                                         when v_tir_a >= v_min_tir then 'ok' else 'malo' end),

    public.ci_indicador('van','VAN del proyecto', v_van,'dinero',
      'Flujo neto descontado a la tasa equivalente del periodo: (1 + WACC)^(1/'
        || v_ppa || ') − 1',
      jsonb_build_array(public.ci_insumo('Tasa de descuento anual', v_tasa,'porcentaje'),
                        public.ci_insumo('Periodos cargados', v_periodos,'numero')))
      || jsonb_build_object('tono', case when v_van is null then null
                                         when v_van >= 0 then 'ok' else 'malo' end),

    public.ci_indicador('dscr','Cobertura de egresos', v_dscr,'numero',
      'Ingresos totales del flujo ÷ egresos totales del flujo. '
      'Es un proxy de bancabilidad, no un DSCR: el de verdad necesita el calendario de servicio de la deuda, que este módulo todavía no tiene.',
      jsonb_build_array(public.ci_insumo('Ingresos totales', v_sum_in,'dinero'),
                        public.ci_insumo('Egresos totales', v_sum_out,'dinero'),
                        public.ci_insumo('Mínimo exigido', v_min_dscr,'numero')))
      || jsonb_build_object('tono', case when v_dscr is null then null
                                         when v_min_dscr is null then 'ok'
                                         when v_dscr >= v_min_dscr then 'ok' else 'malo' end)
  );

  select coalesce(jsonb_agg(jsonb_build_object(
           'periodo', period_no, 'egreso', outflow, 'ingreso', inflow,
           'neto', inflow - outflow, 'nota', note) order by period_no), '[]'::jsonb)
    into v_flujo
    from public.rei_cashflow_periods where feasibility_id = p_feasibility;

  -- El veredicto solo se emite cuando los cuatro mínimos existen Y las
  -- cuatro cifras se pudieron calcular. Con un dato faltante la
  -- respuesta es «no alcanza para dictaminar», que es distinto de «no
  -- cumple» y muy distinto de un visto bueno.
  if v_margen is null or v_tir_a is null or v_van is null or v_dscr is null
     or v_min_margen is null or v_min_tir is null or v_min_dscr is null then
    v_veredicto := 'Faltan datos para dictaminar';
    v_cumple := null;
  else
    v_cumple := v_tir_a >= v_min_tir and v_van >= 0
                and v_dscr >= v_min_dscr and v_margen >= v_min_margen;
    v_veredicto := case when v_cumple
      then 'Bancable: cumple los cuatro mínimos'
      else 'Ajustar estructura: no cumple uno o más mínimos' end;
  end if;

  if v_periodos is null or v_periodos = 0 then
    v_avisos := v_avisos || public.ci_aviso('sin_flujo','bloqueante',
      'El modelo no tiene flujo de caja',
      'Sin periodos no hay TIR, VAN ni cobertura: quedan las cifras estáticas y nada más. Carga la curva de egresos e ingresos.');
  end if;
  if v_tir_p is null and v_periodos > 0 then
    v_avisos := v_avisos || public.ci_aviso('tir_sin_raiz','aviso',
      'La TIR no se puede calcular con este flujo',
      'Un flujo sin cambio de signo —o con varios— no tiene una TIR única. La cifra queda vacía a propósito: inventar una sería peor.');
  end if;
  if v_costo_m2 is null then
    v_avisos := v_avisos || public.ci_aviso('sin_costo_obra','bloqueante',
      'No hay costo de obra por m²',
      'Ni el modelo lo pisa ni la organización tiene el parámetro cargado. Sin él no hay costo directo y no hay margen.');
  end if;
  if v_tasa is null then
    v_avisos := v_avisos || public.ci_aviso('sin_wacc','aviso',
      'No hay tasa de descuento',
      'Sin WACC no hay VAN. Cárgalo en Supuestos o fíjalo en este modelo.');
  end if;
  if f.land_cost = 0 then
    v_avisos := v_avisos || public.ci_aviso('suelo_en_cero','aviso',
      'El suelo está en cero',
      'Si el lote se aporta o se permuta, vale igual: ponerle su valor comercial es lo que hace comparable el margen de este proyecto con el de otro que sí lo compra.');
  end if;

  return jsonb_build_object(
    'modelo', jsonb_build_object(
      'id', f.id, 'etiqueta', f.label, 'version', f.version, 'estado', f.state,
      'producto', f.product, 'periodo', f.period_kind, 'periodos_por_ano', v_ppa,
      'desarrollo', d.name, 'desarrollo_id', d.id, 'moneda', v_moneda,
      'unidades', f.units, 'area_unidad', f.avg_area_m2, 'precio_m2', f.price_m2),
    'supuestos', jsonb_build_object(
      'costo_m2', v_costo_m2, 'indirectos_pct', v_ind_pct, 'financieros_pct', v_fin_pct,
      'comerciales_pct', v_com_pct, 'wacc', v_tasa, 'preventas_pct', v_eq_pct,
      'tir_minima', v_min_tir, 'margen_minimo', v_min_margen, 'dscr_minimo', v_min_dscr),
    'cifras', v_cifras,
    'flujo', v_flujo,
    'veredicto', jsonb_build_object('texto', v_veredicto, 'cumple', v_cumple),
    'alertas', v_avisos);
end $function$;

-- rei_resumen(p_company uuid, p_filtros jsonb)
CREATE OR REPLACE FUNCTION public.rei_resumen(p_company uuid, p_filtros jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_moneda text; v_desde date; v_hasta date;
  v_cifras jsonb; v_series jsonb; v_listas jsonb; v_alertas jsonb := '[]'::jsonb;
  v_muni text; v_tipo text; v_canal text;
  v_total int; v_disp int; v_vend int; v_cierre numeric;
  v_precio_m2 numeric; v_ticket numeric; v_dias numeric;
  v_compradores int; v_ya int; v_presupuesto numeric;
  v_oport int; v_sin_calificar int; v_desarrollos int; v_sin_etapa int;
  v_comision_pct numeric; v_ingresos numeric; v_comision numeric;
  v_sin_fecha int; v_sin_m2 int; v_peso numeric; v_criterios int;
  v_adelantos int; v_sin_garantia int;
begin
  if not public.has_company_level(p_company, 40) then return '{}'::jsonb; end if;

  select currency into v_moneda from public.companies where id = p_company;
  v_desde := coalesce((p_filtros->>'desde')::date,
                      date_trunc('month', current_date - interval '23 months')::date);
  v_hasta := coalesce((p_filtros->>'hasta')::date, date_trunc('month', current_date)::date);
  v_muni  := nullif(p_filtros->>'municipio', '');
  v_tipo  := nullif(p_filtros->>'tipo', '');
  v_canal := nullif(p_filtros->>'canal', '');

  v_comision_pct := public.rei_parametro(p_company, 'comision_intermediacion');

  -- ---------- inventario ----------
  select count(*),
         count(*) filter (where lower(commercial_status) = 'disponible'),
         count(*) filter (where lower(commercial_status) = 'vendido'),
         avg(price_m2),
         avg(coalesce(sale_price, list_price)) filter (where lower(commercial_status) = 'vendido'),
         avg(public.rei_dias_en_mercado(entry_date, sale_date, commercial_status)),
         count(*) filter (where lower(commercial_status) = 'vendido' and sale_date is null),
         count(*) filter (where price_m2 is null)
    into v_total, v_disp, v_vend, v_precio_m2, v_ticket, v_dias, v_sin_fecha, v_sin_m2
    from public.rei_properties
   where company_id = p_company and deleted_at is null
     and (v_muni  is null or city          = v_muni)
     and (v_tipo  is null or property_type = v_tipo)
     and (v_canal is null or channel       = v_canal);

  v_cierre := case when (v_vend + v_disp) > 0
                   then round(v_vend::numeric / (v_vend + v_disp) * 100, 1) end;

  -- ---------- demanda ----------
  select count(*) filter (where lower(client_status) = 'activo'),
         count(*) filter (where lower(client_status) in ('ya compro','ya compró','comprado')),
         avg(budget)
    into v_compradores, v_ya, v_presupuesto
    from public.rei_buyers
   where company_id = p_company and deleted_at is null
     and (v_muni is null or city        = v_muni)
     and (v_tipo is null or wanted_type = v_tipo);

  -- ---------- originación y desarrollo ----------
  select count(*) filter (where status <> 'descartada'),
         count(*) filter (where status <> 'descartada'
                            and not exists (select 1 from public.rei_opportunity_scores s
                                             where s.opportunity_id = o.id))
    into v_oport, v_sin_calificar
    from public.rei_opportunities o
   where o.company_id = p_company and o.deleted_at is null
     and (v_muni is null or o.municipality = v_muni);

  select count(*) filter (where status = 'activo'),
         count(*) filter (where status = 'activo' and stage_id is null)
    into v_desarrollos, v_sin_etapa
    from public.rei_developments
   where company_id = p_company and deleted_at is null
     and (v_muni is null or municipality = v_muni);

  -- ---------- comisión del tramo ----------
  -- Solo cuenta lo vendido CON fecha dentro del rango. Lo demás no se
  -- puede ubicar en el tiempo, y meterlo aquí sería inventar el mes.
  select coalesce(sum(coalesce(sale_price, list_price)), 0)
    into v_ingresos
    from public.rei_properties
   where company_id = p_company and deleted_at is null
     and lower(commercial_status) = 'vendido'
     and sale_date between v_desde and (v_hasta + interval '1 month' - interval '1 day')::date
     and (v_muni  is null or city          = v_muni)
     and (v_tipo  is null or property_type = v_tipo)
     and (v_canal is null or channel       = v_canal);
  v_comision := case when v_comision_pct is not null
                     then round(v_ingresos * v_comision_pct / 100, 2) end;

  -- ---------- adelantos de renta ----------
  select count(*),
         count(*) filter (where coalesce(insurance_status,'') = '' and not promissory_note)
    into v_adelantos, v_sin_garantia
    from public.rei_rental_advances
   where company_id = p_company and deleted_at is null
     and status not in ('rechazado','cancelado','liquidado');

  -- ---------- criterios ----------
  select count(*), coalesce(sum(weight_pct), 0) into v_criterios, v_peso
    from public.rei_criteria where company_id = p_company and active and deleted_at is null;

  -- ---------- las cifras ----------
  v_cifras := jsonb_build_array(
    public.ci_indicador('inmuebles','Inmuebles en base', v_total,'numero',
      'Inmuebles cargados que no están borrados, dentro del filtro',
      jsonb_build_array(public.ci_insumo('Disponibles', v_disp,'numero'),
                        public.ci_insumo('Vendidos', v_vend,'numero'))),

    public.ci_indicador('disponibles','Disponibles hoy', v_disp,'numero',
      'Inmuebles con estado comercial «disponible»', jsonb_build_array()),

    public.ci_indicador('vendidos','Vendidos (histórico)', v_vend,'numero',
      'Inmuebles con estado comercial «vendido», con fecha o sin ella',
      jsonb_build_array(public.ci_insumo('Sin fecha de venta', v_sin_fecha,'numero'))),

    public.ci_indicador('tasa_cierre','Tasa de cierre', v_cierre,'porcentaje',
      'Vendidos ÷ (vendidos + disponibles). Los estados intermedios no entran en ninguno de los dos lados.',
      jsonb_build_array(public.ci_insumo('Vendidos', v_vend,'numero'),
                        public.ci_insumo('Disponibles', v_disp,'numero'))),

    public.ci_indicador('precio_m2','Precio por m² promedio', round(v_precio_m2, 2),'dinero',
      'Promedio de precio publicado ÷ área, sobre los inmuebles que tienen las dos cifras',
      jsonb_build_array(public.ci_insumo('Sin precio por m²', v_sin_m2,'numero'))),

    public.ci_indicador('ticket','Ticket promedio de venta', round(v_ticket, 2),'dinero',
      'Promedio del precio de venta —o del publicado, cuando no se registró el de venta— de lo vendido',
      jsonb_build_array(public.ci_insumo('Ventas contadas', v_vend,'numero'))),

    public.ci_indicador('dias_mercado','Días promedio en mercado', round(v_dias, 0),'dias',
      'Días entre ingreso y venta en lo vendido; entre ingreso y hoy en lo que sigue disponible. '
      'Lo vendido sin fecha de venta no entra en el promedio.',
      jsonb_build_array(public.ci_insumo('Vendidos sin fecha', v_sin_fecha,'numero'))),

    public.ci_indicador('compradores','Compradores activos', v_compradores,'numero',
      'Personas en demanda con estado «activo»',
      jsonb_build_array(public.ci_insumo('Ya compraron', v_ya,'numero'))),

    public.ci_indicador('presupuesto','Presupuesto promedio del comprador',
      round(v_presupuesto, 2),'dinero',
      'Promedio del presupuesto declarado en la base de demanda', jsonb_build_array()),

    public.ci_indicador('comision','Comisión estimada del tramo', v_comision,'dinero',
      'Valor de lo vendido con fecha dentro del rango × comisión de intermediación',
      jsonb_build_array(public.ci_insumo('Ventas del tramo', v_ingresos,'dinero'),
                        public.ci_insumo('% de comisión', v_comision_pct,'porcentaje'))),

    public.ci_indicador('oportunidades','Oportunidades en evaluación', v_oport,'numero',
      'Predios cargados que no fueron descartados',
      jsonb_build_array(public.ci_insumo('Sin calificar', v_sin_calificar,'numero')))
      || jsonb_build_object('tono', case when v_sin_calificar > 0 then 'aviso' end),

    public.ci_indicador('desarrollos','Desarrollos activos', v_desarrollos,'numero',
      'Proyectos de desarrollo con estado «activo»',
      jsonb_build_array(public.ci_insumo('Sin etapa asignada', v_sin_etapa,'numero')))
  );

  -- ---------- las series ----------
  -- Se generan los meses y se cuenta lo que cae en cada uno: así un mes
  -- sin movimiento sale en cero —que es un dato— en vez de desaparecer.
  select jsonb_build_array(
    jsonb_build_object('titulo','Captación y ventas, mes a mes',
      'formato','numero','leyenda', jsonb_build_array('Captados','Vendidos'),
      'puntos', coalesce((select jsonb_agg(jsonb_build_object(
                            'x', mes, 'y', cap, 'y2', ven, 'formato_x','mes') order by mes)
        from (
          select to_char(d,'YYYY-MM') as mes,
            (select count(*) from public.rei_properties p
              where p.company_id = p_company and p.deleted_at is null
                and date_trunc('month', p.entry_date) = d
                and (v_muni  is null or p.city          = v_muni)
                and (v_tipo  is null or p.property_type = v_tipo)
                and (v_canal is null or p.channel       = v_canal)) as cap,
            (select count(*) from public.rei_properties p
              where p.company_id = p_company and p.deleted_at is null
                and date_trunc('month', p.sale_date) = d
                and (v_muni  is null or p.city          = v_muni)
                and (v_tipo  is null or p.property_type = v_tipo)
                and (v_canal is null or p.channel       = v_canal)) as ven
            from generate_series(date_trunc('month', v_desde),
                                 date_trunc('month', v_hasta), interval '1 month') d
        ) s), '[]'::jsonb)),

    jsonb_build_object('titulo','Valor vendido por mes',
      'formato','dinero','leyenda', jsonb_build_array('Vendido'),
      'puntos', coalesce((select jsonb_agg(jsonb_build_object(
                            'x', mes, 'y', val, 'formato_x','mes') order by mes)
        from (
          select to_char(d,'YYYY-MM') as mes,
            (select coalesce(sum(coalesce(p.sale_price, p.list_price)), 0)
               from public.rei_properties p
              where p.company_id = p_company and p.deleted_at is null
                and date_trunc('month', p.sale_date) = d
                and (v_muni  is null or p.city          = v_muni)
                and (v_tipo  is null or p.property_type = v_tipo)
                and (v_canal is null or p.channel       = v_canal)) as val
            from generate_series(date_trunc('month', v_desde),
                                 date_trunc('month', v_hasta), interval '1 month') d
        ) s), '[]'::jsonb)))
    into v_series;

  -- ---------- las listas ----------
  select jsonb_build_array(
    -- La brecha es la cifra que justifica el módulo: dice qué hay que
    -- salir a captar, no cuánto se vendió.
    jsonb_build_object('titulo','Brecha oferta / demanda por tipología',
      'nota','Compradores que buscan cada tipo, menos inmuebles disponibles de ese tipo',
      'columnas', jsonb_build_array(
        jsonb_build_object('k','tipo','t','Tipología'),
        jsonb_build_object('k','inventario','t','En inventario','formato','numero'),
        jsonb_build_object('k','disponibles','t','Disponibles','formato','numero'),
        jsonb_build_object('k','compradores','t','Compradores','formato','numero'),
        jsonb_build_object('k','brecha','t','Brecha','formato','numero'),
        jsonb_build_object('k','precio_m2','t','Precio/m² oferta','formato','dinero'),
        jsonb_build_object('k','presupuesto','t','Presupuesto demanda','formato','dinero')),
      'filas', coalesce((select jsonb_agg(jsonb_build_object(
                  'tipo', tipo, 'inventario', inv, 'disponibles', disp,
                  'compradores', comp, 'brecha', comp - disp,
                  'precio_m2', round(pm2, 2), 'presupuesto', round(pres, 2))
                  order by (comp - disp) desc)
        from (
          select t.tipo,
                 (select count(*) from public.rei_properties p
                   where p.company_id = p_company and p.deleted_at is null
                     and p.property_type = t.tipo) as inv,
                 (select count(*) from public.rei_properties p
                   where p.company_id = p_company and p.deleted_at is null
                     and p.property_type = t.tipo
                     and lower(p.commercial_status) = 'disponible') as disp,
                 (select count(*) from public.rei_buyers b
                   where b.company_id = p_company and b.deleted_at is null
                     and b.wanted_type = t.tipo
                     and lower(b.client_status) = 'activo') as comp,
                 (select avg(p.price_m2) from public.rei_properties p
                   where p.company_id = p_company and p.deleted_at is null
                     and p.property_type = t.tipo) as pm2,
                 (select avg(b.budget) from public.rei_buyers b
                   where b.company_id = p_company and b.deleted_at is null
                     and b.wanted_type = t.tipo) as pres
            from (select property_type as tipo from public.rei_properties
                   where company_id = p_company and deleted_at is null and property_type is not null
                  union
                  select wanted_type from public.rei_buyers
                   where company_id = p_company and deleted_at is null and wanted_type is not null) t
        ) g), '[]'::jsonb)),

    jsonb_build_object('titulo','Efectividad por canal de captación',
      'nota','De lo que entró por cada canal, cuánto se vendió',
      'columnas', jsonb_build_array(
        jsonb_build_object('k','canal','t','Canal'),
        jsonb_build_object('k','captados','t','Captados','formato','numero'),
        jsonb_build_object('k','vendidos','t','Vendidos','formato','numero'),
        jsonb_build_object('k','efectividad','t','Efectividad','formato','porcentaje')),
      'filas', coalesce((select jsonb_agg(jsonb_build_object(
                  'canal', canal, 'captados', captados, 'vendidos', vendidos,
                  'efectividad', round(vendidos::numeric / captados * 100, 1))
                  order by captados desc)
        from (
          select coalesce(nullif(btrim(channel), ''), 'Sin registrar') as canal,
                 count(*) as captados,
                 count(*) filter (where lower(commercial_status) = 'vendido') as vendidos
            from public.rei_properties
           where company_id = p_company and deleted_at is null
             and (v_muni is null or city          = v_muni)
             and (v_tipo is null or property_type = v_tipo)
           group by 1
        ) c), '[]'::jsonb)),

    jsonb_build_object('titulo','Pipeline de desarrollo',
      'nota','Cada proyecto y en qué punto del proceso va',
      'columnas', jsonb_build_array(
        jsonb_build_object('k','proyecto','t','Proyecto'),
        jsonb_build_object('k','municipio','t','Municipio'),
        jsonb_build_object('k','etapa','t','Etapa'),
        jsonb_build_object('k','avance','t','Avance','formato','porcentaje'),
        jsonb_build_object('k','responsable','t','Responsable'),
        jsonb_build_object('k','hito','t','Próximo hito')),
      'filas', coalesce((select jsonb_agg(jsonb_build_object(
                  'proyecto', d.name, 'municipio', d.municipality,
                  'etapa', coalesce(e.name, 'Sin etapa'), 'avance', a.pct,
                  'responsable', d.manager, 'hito', d.next_milestone)
                  order by a.pct desc nulls last, d.name)
                from public.rei_developments d
                left join public.rei_stages e on e.id = d.stage_id
                cross join lateral (select public.rei_avance_etapa(d.id) as pct) a
               where d.company_id = p_company and d.deleted_at is null and d.status = 'activo'
                 and (v_muni is null or d.municipality = v_muni)), '[]'::jsonb)),

    jsonb_build_object('titulo','Oportunidades calificadas',
      'nota','Ordenadas por nota. La banda decide qué se estructura primero.',
      'columnas', jsonb_build_array(
        jsonb_build_object('k','oportunidad','t','Oportunidad'),
        jsonb_build_object('k','municipio','t','Municipio'),
        jsonb_build_object('k','area','t','Área m²','formato','numero'),
        jsonb_build_object('k','precio_m2','t','Precio/m²','formato','dinero'),
        jsonb_build_object('k','score','t','Nota','formato','numero'),
        jsonb_build_object('k','banda','t','Banda'),
        jsonb_build_object('k','decision','t','Decisión sugerida')),
      'filas', coalesce((select jsonb_agg(jsonb_build_object(
                  'oportunidad', o.name, 'municipio', o.municipality,
                  'area', o.area_m2, 'precio_m2', o.price_m2,
                  'score', (n.j->>'score')::numeric,
                  'banda', n.j->>'banda', 'decision', n.j->>'decision')
                  order by (n.j->>'score')::numeric desc nulls last, o.name)
                from public.rei_opportunities o
                -- La nota, una vez por oportunidad. Llamarla dentro de cada
                -- campo la calcularía cuatro veces para dibujar una fila.
                cross join lateral (select public.rei_score(o.id) as j) n
               where o.company_id = p_company and o.deleted_at is null
                 and o.status <> 'descartada'
                 and (v_muni is null or o.municipality = v_muni)), '[]'::jsonb)),

    jsonb_build_object('titulo','Próximos hitos',
      'nota','Lo que viene en los siguientes 90 días',
      'columnas', jsonb_build_array(
        jsonb_build_object('k','hito','t','Hito'),
        jsonb_build_object('k','proyecto','t','Proyecto'),
        jsonb_build_object('k','fecha','t','Fecha','formato','fecha'),
        jsonb_build_object('k','monto','t','Monto que condiciona','formato','dinero')),
      'filas', coalesce((select jsonb_agg(jsonb_build_object(
                  'hito', h.name, 'proyecto', d.name, 'fecha', h.due_date,
                  'monto', h.amount_conditioned) order by h.due_date)
                from public.rei_milestones h
                join public.rei_developments d on d.id = h.development_id
               where h.company_id = p_company and h.deleted_at is null
                 and d.deleted_at is null and h.status <> 'hecho'
                 and h.due_date between current_date and current_date + 90), '[]'::jsonb)))
    into v_listas;

  -- ---------- las alertas ----------
  -- Van primero en la pantalla: lo bloqueante es lo que impide que una
  -- cifra signifique algo; lo de aviso es lo que hay que arreglar antes
  -- de sacarle conclusiones.
  if v_sin_fecha > 0 then
    v_alertas := v_alertas || public.ci_aviso('ventas_sin_fecha','bloqueante',
      v_sin_fecha || ' inmueble(s) vendidos sin fecha de venta',
      'No entran en la curva mensual ni en la comisión del tramo, y bajan el promedio de días en mercado sin aparecer. '
      'Un año en cero en la gráfica casi siempre es esto, no una caída de la actividad.');
  end if;
  if v_sin_m2 > 0 then
    v_alertas := v_alertas || public.ci_aviso('sin_precio_m2','aviso',
      v_sin_m2 || ' inmueble(s) sin precio por m²',
      'Les falta el área o el precio publicado. Quedan fuera de los comparables, que son la base con la que se fija el precio de un proyecto nuevo.');
  end if;
  if v_sin_calificar > 0 then
    v_alertas := v_alertas || public.ci_aviso('oportunidades_sin_calificar','aviso',
      v_sin_calificar || ' oportunidad(es) sin calificar',
      'Sin nota no tienen banda, y sin banda el pipeline se ordena por quién habló último.');
  end if;
  if v_criterios = 0 then
    v_alertas := v_alertas || public.ci_aviso('sin_criterios','bloqueante',
      'No hay criterios de calificación cargados',
      'Ninguna oportunidad puede tener nota. Cárgalos en la pestaña Criterios.');
  elsif v_peso <> 100 then
    v_alertas := v_alertas || public.ci_aviso('pesos_no_suman','aviso',
      'Los pesos de los criterios suman ' || trim(to_char(v_peso, 'FM999990.##')) || '%',
      'Las notas salen igual —se dividen por el peso repartido— pero dos oportunidades calificadas con repartos distintos no se pueden comparar.');
  end if;
  if v_sin_etapa > 0 then
    v_alertas := v_alertas || public.ci_aviso('desarrollos_sin_etapa','aviso',
      v_sin_etapa || ' desarrollo(s) activos sin etapa',
      'No tienen % de avance y no aparecen ordenados en el pipeline.');
  end if;
  if v_comision_pct is null then
    v_alertas := v_alertas || public.ci_aviso('sin_comision','aviso',
      'No hay comisión de intermediación configurada',
      'La comisión estimada queda vacía. Cárgala en Supuestos como «comision_intermediacion».');
  end if;
  if v_sin_garantia > 0 then
    v_alertas := v_alertas || public.ci_aviso('adelantos_sin_garantia','bloqueante',
      v_sin_garantia || ' adelanto(s) de renta sin póliza ni pagaré',
      'El adelanto se entrega hoy y el canon llega en cuotas: sin garantía, la vacancia o la mora del inquilino las cubre entera la sociedad.');
  end if;

  return jsonb_build_object(
    'moneda', v_moneda,
    'periodo', jsonb_build_object('desde', to_char(v_desde,'YYYY-MM'),
                                  'hasta', to_char(v_hasta,'YYYY-MM')),
    'cifras', v_cifras, 'series', v_series, 'listas', v_listas, 'alertas', v_alertas);
end $function$;

-- rei_sembrar_base_interno(p_company uuid, p_creado_por uuid)
CREATE OR REPLACE FUNCTION public.rei_sembrar_base_interno(p_company uuid, p_creado_por uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_pais text; v_moneda text; v_co boolean; v_cop boolean;
  v_par int; v_cri int; v_eta int;
begin
  select upper(coalesce(country, '')), upper(coalesce(currency, ''))
    into v_pais, v_moneda
    from public.companies where id = p_company;
  if v_pais is null then raise exception 'La organización no existe'; end if;
  v_co  := (v_pais = 'CO');      -- decide las tarifas, que son porcentajes
  v_cop := (v_moneda = 'COP');   -- decide los montos, que van en una moneda

  -- ---------- SUPUESTOS ----------
  insert into public.rei_parameters
    (company_id, slug, category, name, value, unit, source, notes, sort, created_by)
  select p_company, x.slug, x.categoria, x.nombre,
         case x.condicion
           when 'pais_co'    then case when v_co  then x.valor end
           when 'moneda_cop' then case when v_cop then x.valor end
           else x.valor
         end,
         x.unidad, x.fuente, x.nota, x.orden, p_creado_por
    from (values
      -- ---- estructuración financiera (criterio de industria) ----
      ('wacc', 'financiero', 'Tasa de descuento / WACC objetivo', 16.0, 'pct', 'siempre',
       'Rango típico del sector inmobiliario 14%-20% EA según riesgo del proyecto',
       'Es la tasa con la que se descuenta el flujo para el VAN. Súbela cuando el proyecto sea más riesgoso que el promedio de la cartera.', 10),
      ('tir_minima', 'financiero', 'TIR mínima exigida al proyecto', 20.0, 'pct', 'siempre',
       'Piso interno de aprobación',
       'Por debajo de esto el proyecto no pasa a estructuración, aunque el VAN sea positivo.', 20),
      ('margen_minimo', 'financiero', 'Margen mínimo sobre ventas', 20.0, 'pct', 'siempre',
       'Estándar de la industria: 20%-25%',
       'Utilidad ÷ ingresos por ventas.', 30),
      ('equilibrio_maximo', 'financiero', 'Punto de equilibrio máximo aceptable', 65.0, 'pct', 'siempre',
       'Prácticas fiduciarias',
       '% de unidades que hay que tener vendidas para iniciar obra. Cuanto más alto, más tarde arranca el proyecto.', 40),
      ('preventas_minimas', 'financiero', 'Preventas mínimas para el punto de equilibrio', 70.0, 'pct', 'siempre',
       'Los recursos de los compradores quedan en fiducia hasta el punto de equilibrio técnico-financiero',
       'Es el % que usa la prefactibilidad para calcular cuántas unidades hay que preventar.', 50),
      ('dscr_minimo', 'financiero', 'Cobertura mínima exigida por la banca', 1.3, 'numero', 'siempre',
       'Cobertura de servicio de deuda típica de crédito constructor',
       'El módulo calcula un proxy de cobertura sobre el flujo. Un DSCR formal necesita el calendario de la deuda.', 60),
      ('apalancamiento_maximo', 'financiero', 'Apalancamiento máximo (deuda / costo total)', 60.0, 'pct', 'siempre',
       'El crédito constructor suele financiar 50%-70% del costo directo',
       'Tope de deuda sobre el costo total del proyecto.', 70),

      -- ---- costos de obra: MONTOS, atados a la moneda ----
      ('costo_directo_vis', 'obra', 'Costo directo de construcción · VIS', 2200000.0, 'dinero_m2', 'moneda_cop',
       'Estimado gremial Colombia — actualizar con cotización local',
       'Por m² construido. Es el insumo del que sale el costo directo de cualquier prefactibilidad de producto VIS.', 100),
      ('costo_directo_no_vis', 'obra', 'Costo directo de construcción · No VIS', 2800000.0, 'dinero_m2', 'moneda_cop',
       'Estimado gremial Colombia — actualizar con presupuesto de obra real',
       'Por m² construido, para producto distinto de VIS.', 110),
      ('costos_indirectos_pct', 'obra', 'Costos indirectos (% sobre costo directo)', 25.0, 'pct', 'siempre',
       'Práctica de la industria',
       'Diseño, licencias, interventoría y administración de obra.', 120),
      ('gastos_financieros_pct', 'obra', 'Gastos financieros (% sobre costo)', 8.0, 'pct', 'siempre',
       'Práctica de la industria',
       'Intereses y comisiones de estructuración durante la construcción.', 130),
      ('gastos_comerciales_pct', 'obra', 'Gastos comerciales (% sobre ingresos)', 6.0, 'pct', 'siempre',
       'Práctica de la industria',
       'Comisiones de venta y mercadeo del proyecto.', 140),

      -- ---- comercial ----
      ('comision_intermediacion', 'comercial', 'Comisión de intermediación', 3.0, 'pct', 'siempre',
       'Comisión estándar de corretaje sobre el precio de venta',
       'Con esto el panel estima el ingreso por comisión de lo vendido en el tramo.', 200),
      ('adelanto_canon_pct', 'comercial', 'Descuento del adelanto de cánones', 15.0, 'pct', 'siempre',
       'Punto de partida — validar con jurídico antes de lanzar el producto',
       'Descuento implícito sobre el flujo de renta cedido. Debe cubrir el costo de fondeo, la vacancia estimada y el seguro.', 210),

      -- ---- tributario y transaccional: PORCENTAJES, atados al país ----
      ('renta_sociedades', 'tributario', 'Impuesto de renta · sociedades', 35.0, 'pct', 'pais_co',
       'Tarifa general — verificar vigencia y régimen aplicable',
       'No es asesoría tributaria: confirmar con el contador antes de estructurar.', 300),
      ('retencion_venta_inmueble', 'tributario', 'Retención en la fuente por venta de inmuebles', 1.0, 'pct', 'pais_co',
       'Sobre el mayor valor entre precio de venta y avalúo catastral',
       'Ajustar según UVT y notaría.', 310),
      ('iva_construccion_vivienda', 'tributario', 'IVA a la construcción de vivienda', 0.0, 'pct', 'pais_co',
       'La vivienda nueva está excluida o exenta según normativa vigente',
       'Confirmar el tratamiento para producto no VIS y comercial.', 320),
      ('notariales_registro', 'tributario', 'Gastos notariales y de registro', 1.5, 'pct', 'pais_co',
       'Estimado combinado notaría + registro + beneficencia',
       'Sobre el valor de la escritura. Validar tarifas del departamento.', 330),
      ('ica_municipal', 'tributario', 'Industria y comercio (ICA) municipal', 0.7, 'pct', 'pais_co',
       'Tarifa estimada para actividad inmobiliaria',
       'Confirmar la tarifa vigente del municipio.', 340),
      ('delineacion_urbana', 'tributario', 'Delineación urbana / licencia de construcción', 1.0, 'pct', 'pais_co',
       'Varía por curaduría y municipio',
       'Sobre el presupuesto de obra. Presupuestar por proyecto.', 350),
      ('comision_fiduciaria', 'tributario', 'Comisión fiduciaria de estructuración', 1.5, 'pct', 'pais_co',
       'Estimado — cotizar con las fiduciarias aliadas',
       'Sobre el valor del patrimonio autónomo.', 360)
    ) as x(slug, categoria, nombre, valor, unidad, condicion, fuente, nota, orden)
  on conflict (company_id, slug) do nothing;
  get diagnostics v_par = row_count;

  -- ---------- CRITERIOS DE CALIFICACIÓN ----------
  insert into public.rei_criteria
    (company_id, name, weight_pct, measures, level_low, level_mid, level_high, sort, created_by)
  select p_company, x.nombre, x.peso, x.mide, x.bajo, x.medio, x.alto, x.orden, p_creado_por
    from (values
      ('Demanda y mercado', 20.0,
       'Compradores activos interesados en esa zona y tipología, cruzado con la base de demanda',
       'Sin compradores registrados en el sector',
       'Demanda moderada, interés ocasional',
       'Demanda represada, con lista de espera', 10),
      ('Ubicación y accesibilidad', 15.0,
       'Vías, servicios públicos, cercanía a equipamientos y seguridad de la zona',
       'Sin vías de acceso ni servicios básicos',
       'Servicios parciales, acceso regular',
       'Servicios completos, vía pavimentada, zona consolidada', 20),
      ('Situación jurídica del predio', 20.0,
       'Estado de títulos, linderos, gravámenes y uso del suelo',
       'Títulos en litigio o sin escriturar',
       'Papeles al día con trámites pendientes',
       'Títulos saneados, libre de gravámenes, uso permitido', 30),
      ('Viabilidad financiera', 20.0,
       'Margen y TIR estimados contra los mínimos exigidos en Supuestos',
       'Margen y TIR por debajo del mínimo',
       'En el límite de los mínimos',
       'Margen y TIR superan holgadamente el mínimo', 40),
      ('Punto de equilibrio y preventas', 10.0,
       'Probabilidad de alcanzar el nivel de preventas que exige la fiducia para escriturar',
       'Muy difícil llegar al punto de equilibrio',
       'Alcanzable con esfuerzo comercial adicional',
       'Alta probabilidad de superarlo rápido', 50),
      ('Estructura de capital y bancabilidad', 10.0,
       'Facilidad para conseguir crédito constructor y montar la estructura fiduciaria',
       'Sin garantías, difícil de bancarizar',
       'Bancarizable con garantías adicionales',
       'Cumple la cobertura exigida, fácilmente bancable', 60),
      ('Alineación estratégica', 5.0,
       'Qué tanto aporta al plan de expansión declarado',
       'Fuera del área de expansión',
       'Municipio secundario del plan',
       'Municipio prioritario del plan', 70)
    ) as x(nombre, peso, mide, bajo, medio, alto, orden)
  on conflict (company_id, name) do nothing;
  get diagnostics v_cri = row_count;

  -- ---------- ETAPAS DEL PROCESO ----------
  insert into public.rei_stages (company_id, name, phase, sort)
  select p_company, x.nombre, x.fase, x.orden
    from (values
      ('Terreno identificado',  'originacion',     10),
      ('Análisis jurídico',     'originacion',     20),
      ('Análisis urbanístico',  'originacion',     30),
      ('Estudio de mercado',    'originacion',     40),
      ('Prefactibilidad',       'estructuracion',  50),
      ('Modelo financiero',     'estructuracion',  60),
      ('Estructura de capital', 'estructuracion',  70),
      ('Fiduciaria',            'estructuracion',  80),
      ('Financiación',          'financiacion',    90),
      ('Preventas',             'financiacion',   100),
      ('Construcción',          'ejecucion',      110),
      ('Comercialización',      'ejecucion',      120),
      ('Cierre',                'salida',         130)
    ) as x(nombre, fase, orden)
  on conflict (company_id, name) do nothing;
  get diagnostics v_eta = row_count;

  return jsonb_build_object(
    'pais', v_pais, 'moneda', v_moneda,
    'tarifas_sembradas', v_co, 'montos_sembrados', v_cop,
    'supuestos', v_par, 'criterios', v_cri, 'etapas', v_eta);
end $function$;

-- rei_sembrar_curva(p_feasibility uuid)
CREATE OR REPLACE FUNCTION public.rei_sembrar_curva(p_feasibility uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  f record; v_costo jsonb; v_n int; i int; v_total numeric; v_ing numeric;
  v_out numeric[] := array[0.05, 0.15, 0.20, 0.25, 0.20, 0.10, 0.05, 0.00, 0.00];
  v_in  numeric[] := array[0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.10, 0.30, 0.30];
begin
  select * into f from public.rei_feasibility where id = p_feasibility and deleted_at is null;
  if f is null then raise exception 'El modelo no existe'; end if;
  if not public.has_company_level(f.company_id, 60) then
    raise exception 'No tienes permiso para editar este modelo';
  end if;
  if f.state = 'validado' then
    raise exception 'Este modelo está validado. Crea una versión nueva para cambiarlo.';
  end if;

  select count(*) into v_n from public.rei_cashflow_periods where feasibility_id = p_feasibility;
  if v_n > 0 then return 0; end if;

  v_costo := public.rei_prefactibilidad(p_feasibility) -> 'cifras';
  select (c->>'valor')::numeric into v_total
    from jsonb_array_elements(v_costo) c where c->>'clave' = 'costo_total';
  select (c->>'valor')::numeric into v_ing
    from jsonb_array_elements(v_costo) c where c->>'clave' = 'ingresos';
  if v_total is null or v_ing is null then
    raise exception 'Faltan supuestos para repartir: sin costo total ni ingresos no hay curva que sembrar';
  end if;

  for i in 1 .. array_length(v_out, 1) loop
    insert into public.rei_cashflow_periods
      (company_id, feasibility_id, period_no, outflow, inflow, note)
    values (f.company_id, p_feasibility, i - 1,
            round(v_total * v_out[i], 2), round(v_ing * v_in[i], 2),
            'Curva S estándar — reemplazar con el cronograma real');
  end loop;
  return array_length(v_out, 1);
end $function$;

-- rei_sincronizar_crm(p_company uuid)
CREATE OR REPLACE FUNCTION public.rei_sincronizar_crm(p_company uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_nuevos_demanda int := 0; v_nuevos_inventario int := 0;
  v_enlaza_compradores int := 0; v_enlaza_inmuebles int := 0;
  v_sin_llave int := 0;
begin
  if not public.has_company_level(p_company, 60) then
    raise exception 'No tienes permiso para sincronizar el CRM de esta empresa';
  end if;

  insert into public.customers (company_id, name, customer_type, phone, comuna, status, notes)
  select p_company,
         initcap(p.nombre), 'particular'::customer_type,
         nullif(p.telefono, ''), p.ciudad, 'activo'::entity_status,
         'Ficha creada desde la demanda de Real Estate Intelligence.'
    from (
      select distinct on (public.rei_clave_persona(b.name, b.contact))
             public.rei_clave_persona(b.name, b.contact) as clave,
             btrim(b.name) as nombre, btrim(b.contact) as telefono, b.city as ciudad
        from public.rei_buyers b
       where b.company_id = p_company and b.deleted_at is null and b.customer_id is null
         and public.rei_clave_persona(b.name, b.contact) is not null
         and btrim(coalesce(b.name, '')) <> ''
       order by public.rei_clave_persona(b.name, b.contact),
                (b.city is not null) desc, (b.budget is not null) desc, b.created_at
    ) p
   where not exists (
     select 1 from public.customers c
      where c.company_id = p_company
        and public.rei_clave_persona(c.name, c.phone) = p.clave);
  get diagnostics v_nuevos_demanda = row_count;

  update public.rei_buyers b
     set customer_id = c.id
    from public.customers c
   where b.company_id = p_company and b.deleted_at is null and b.customer_id is null
     and c.company_id = p_company
     and public.rei_clave_persona(c.name, c.phone)
       = public.rei_clave_persona(b.name, b.contact);
  get diagnostics v_enlaza_compradores = row_count;

  insert into public.customers (company_id, name, customer_type, phone, comuna, status, notes)
  select p_company,
         initcap(p.nombre), 'particular'::customer_type,
         nullif(p.telefono, ''), p.ciudad, 'activo'::entity_status,
         'Ficha creada desde el inventario de Real Estate Intelligence.'
    from (
      select distinct on (public.rei_clave_persona(r.owner_name, r.contact))
             public.rei_clave_persona(r.owner_name, r.contact) as clave,
             btrim(r.owner_name) as nombre, btrim(r.contact) as telefono, r.city as ciudad
        from public.rei_properties r
       where r.company_id = p_company and r.deleted_at is null and r.owner_customer_id is null
         and public.rei_clave_persona(r.owner_name, r.contact) is not null
         and btrim(coalesce(r.owner_name, '')) <> ''
       order by public.rei_clave_persona(r.owner_name, r.contact),
                (r.city is not null) desc, r.created_at
    ) p
   where not exists (
     select 1 from public.customers c
      where c.company_id = p_company
        and public.rei_clave_persona(c.name, c.phone) = p.clave);
  get diagnostics v_nuevos_inventario = row_count;

  update public.rei_properties r
     set owner_customer_id = c.id
    from public.customers c
   where r.company_id = p_company and r.deleted_at is null and r.owner_customer_id is null
     and c.company_id = p_company
     and public.rei_clave_persona(c.name, c.phone)
       = public.rei_clave_persona(r.owner_name, r.contact);
  get diagnostics v_enlaza_inmuebles = row_count;

  update public.customers c
     set phone  = coalesce(c.phone,  nullif(btrim(b.contact), '')),
         comuna = coalesce(c.comuna, b.city)
    from public.rei_buyers b
   where b.customer_id = c.id and c.company_id = p_company
     and (c.phone is null or c.comuna is null);

  update public.customers c
     set phone  = coalesce(c.phone,  nullif(btrim(r.contact), '')),
         comuna = coalesce(c.comuna, r.city)
    from public.rei_properties r
   where r.owner_customer_id = c.id and c.company_id = p_company
     and (c.phone is null or c.comuna is null);

  select count(*) into v_sin_llave
    from (select 1 from public.rei_buyers
           where company_id = p_company and deleted_at is null and customer_id is null
          union all
          select 1 from public.rei_properties
           where company_id = p_company and deleted_at is null and owner_customer_id is null) t;

  return jsonb_build_object(
    'clientes_nuevos',       v_nuevos_demanda + v_nuevos_inventario,
    'desde_la_demanda',      v_nuevos_demanda,
    'desde_el_inventario',   v_nuevos_inventario,
    'compradores_enlazados', v_enlaza_compradores,
    'inmuebles_enlazados',   v_enlaza_inmuebles,
    'sin_enlazar',           v_sin_llave,
    'total_clientes',        (select count(*) from public.customers where company_id = p_company));
end $function$;

-- rei_sincronizar_ventas(p_company uuid)
CREATE OR REPLACE FUNCTION public.rei_sincronizar_ventas(p_company uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_producto uuid; v_pct numeric; v_nuevos int := 0;
  v_sin_fecha int; v_sin_dueno int; v_sin_precio int;
begin
  if not public.has_company_level(p_company, 60) then
    raise exception 'No tienes permiso para sincronizar las ventas de esta empresa';
  end if;

  v_pct := public.rei_parametro(p_company, 'comision_intermediacion');
  if v_pct is null then
    raise exception 'Falta el supuesto «comision_intermediacion». Cárgalo en Supuestos antes de convertir las ventas.';
  end if;

  select id into v_producto
    from public.products
   where company_id = p_company and sku = 'INTERMEDIACION';

  if v_producto is null then
    insert into public.products (company_id, sku, name, base_unit, sale_price,
                                 is_perishable, status, notes)
    values (p_company, 'INTERMEDIACION', 'Intermediación inmobiliaria',
            'unidad', 0, false, 'activo',
            'El servicio que cobra la firma por cada venta cerrada. El precio va por pedido: '
            || 'es un porcentaje del inmueble, no una tarifa fija.')
    returning id into v_producto;
  end if;

  with pendientes as (
    select r.id, r.code, r.owner_customer_id, r.sale_date, r.list_price,
           r.property_type, r.city, r.neighborhood, r.area_m2,
           round(r.list_price * v_pct / 100, 2) as comision
      from public.rei_properties r
     where r.company_id = p_company and r.deleted_at is null
       and r.commercial_status = 'vendido'
       and r.order_id is null
       and r.sale_date is not null
       and r.list_price > 0
       and r.owner_customer_id is not null
  ), creados as (
    insert into public.orders (company_id, customer_id, status, order_date,
                               payment_method, payment_status, amount_paid, notes, custom)
    select p_company, p.owner_customer_id, 'entregado'::order_status,
           p.sale_date::timestamptz, 'otro'::payment_method,
           'pagado'::payment_status, p.comision,
           'Venta cerrada del inventario inmobiliario. El total es la comisión de intermediación ('
             || trim(to_char(v_pct, 'FM999990.##')) || '% del precio del inmueble), no el precio. '
             || 'La planilla de origen no registra quién compró: el cliente es el propietario.',
           jsonb_strip_nulls(jsonb_build_object(
             'inmueble',        p.code,
             'precio_inmueble', p.list_price,
             'comision_pct',    v_pct,
             'tipologia',       p.property_type,
             'municipio',       p.city,
             'barrio',          p.neighborhood,
             'area_m2',         p.area_m2))
      from pendientes p
    returning id, (custom->>'inmueble') as inmueble
  ), lineas as (
    insert into public.order_items (company_id, order_id, product_id, quantity_ordered,
                                    unit, unit_price, discount, unit_cost, is_reserved, notes)
    select p_company, c.id, v_producto, 1, 'unidad'::unit_measure,
           p.comision, 0, 0, false,
           'Comisión sobre ' || to_char(p.list_price, 'FM999G999G999G999') || ' del inmueble ' || p.code
      from creados c join pendientes p on p.code = c.inmueble
    returning order_id
  )
  update public.rei_properties r
     set order_id = c.id
    from creados c
   where r.company_id = p_company and r.code = c.inmueble and r.order_id is null;
  get diagnostics v_nuevos = row_count;

  select count(*) filter (where sale_date is null),
         count(*) filter (where sale_date is not null and owner_customer_id is null),
         count(*) filter (where sale_date is not null and coalesce(list_price, 0) <= 0)
    into v_sin_fecha, v_sin_dueno, v_sin_precio
    from public.rei_properties
   where company_id = p_company and deleted_at is null
     and commercial_status = 'vendido' and order_id is null;

  return jsonb_build_object(
    'pedidos_nuevos',   v_nuevos,
    'comision_pct',     v_pct,
    'fuera_sin_fecha',  v_sin_fecha,
    'fuera_sin_dueno',  v_sin_dueno,
    'fuera_sin_precio', v_sin_precio,
    'total_pedidos',    (select count(*) from public.orders where company_id = p_company),
    'comision_total',   (select coalesce(sum(o.total), 0) from public.orders o
                          join public.rei_properties r on r.order_id = o.id
                         where o.company_id = p_company));
end $function$;

-- resumen_modulo(p_company uuid, p_modulo text)
CREATE OR REPLACE FUNCTION public.resumen_modulo(p_company uuid, p_modulo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r jsonb;
begin
  if not public.has_company_level(p_company, 40) then
    return '{}'::jsonb;
  end if;

  case p_modulo

  when 'crm' then
    select jsonb_build_object(
      'cifras', jsonb_build_array(
        jsonb_build_object('etiqueta','Clientes activos','formato','numero','valor',
          (select count(*) from customers where company_id=p_company and status='activo')),
        jsonb_build_object('etiqueta','Nuevos en 30 días','formato','numero','valor',
          (select count(*) from customers where company_id=p_company and created_at >= now()-interval '30 days')),
        jsonb_build_object('etiqueta','Con deuda','formato','numero','tono','aviso','valor',
          (select count(distinct o.customer_id) from orders o
            where o.company_id=p_company and o.status<>'cancelado' and o.total>o.amount_paid)),
        jsonb_build_object('etiqueta','Ticket medio','formato','dinero','nota','últimos 180 días','valor',
          (select coalesce(round(avg(o.total)),0) from orders o
            where o.company_id=p_company and o.status<>'cancelado'
              and o.order_date >= now()-interval '180 days'))),
      'series', '[]'::jsonb,
      'listas', jsonb_build_array(
        jsonb_build_object(
          'titulo','Quién compra más','nota','Ventas de los últimos 180 días.',
          'columnas', jsonb_build_array(
            jsonb_build_object('k','n','t','Cliente'),
            jsonb_build_object('k','comuna','t','Comuna'),
            jsonb_build_object('k','pedidos','t','Pedidos','formato','numero'),
            jsonb_build_object('k','ventas','t','Ventas','formato','dinero')),
          'filas', (select coalesce(jsonb_agg(x order by (x->>'ventas')::numeric desc), '[]'::jsonb) from (
            select jsonb_build_object('n',c.name,'comuna',c.comuna,
                     'pedidos',count(o.id),'ventas',coalesce(sum(o.total),0)) x
              from customers c
              join orders o on o.customer_id=c.id and o.status<>'cancelado'
                           and o.order_date >= now()-interval '180 days'
             where c.company_id=p_company
             group by c.id,c.name,c.comuna
             order by sum(o.total) desc limit 8) s)),
        jsonb_build_object(
          'titulo','Quién debe','nota','Saldo pendiente por cliente, del más viejo al más nuevo.',
          'columnas', jsonb_build_array(
            jsonb_build_object('k','n','t','Cliente'),
            jsonb_build_object('k','docs','t','Documentos','formato','numero'),
            jsonb_build_object('k','dias','t','Más antiguo','formato','dias'),
            jsonb_build_object('k','saldo','t','Saldo','formato','dinero','tono','malo')),
          'filas', (select coalesce(jsonb_agg(x order by (x->>'saldo')::numeric desc), '[]'::jsonb) from (
            select jsonb_build_object('n',c.name,'docs',count(o.id),
                     'dias',max(current_date - coalesce(o.due_date,o.order_date::date)),
                     'saldo',sum(o.total-o.amount_paid)) x
              from customers c
              join orders o on o.customer_id=c.id and o.status<>'cancelado' and o.total>o.amount_paid
             where c.company_id=p_company
             group by c.id,c.name
             order by sum(o.total-o.amount_paid) desc limit 8) s)),
        jsonb_build_object(
          'titulo','En silencio','nota','Compraron alguna vez y llevan más de 60 días sin volver.',
          'columnas', jsonb_build_array(
            jsonb_build_object('k','n','t','Cliente'),
            jsonb_build_object('k','dias','t','Sin comprar','formato','dias','tono','aviso'),
            jsonb_build_object('k','historico','t','Compró en total','formato','dinero')),
          'filas', (select coalesce(jsonb_agg(x order by (x->>'historico')::numeric desc), '[]'::jsonb) from (
            select jsonb_build_object('n',c.name,
                     'dias',current_date - max(o.order_date)::date,
                     'historico',sum(o.total)) x
              from customers c
              join orders o on o.customer_id=c.id and o.status<>'cancelado'
             where c.company_id=p_company and c.status='activo'
             group by c.id,c.name
            having max(o.order_date) < now()-interval '60 days'
             order by sum(o.total) desc limit 6) s)))
    ) into r;

  when 'commerce' then
    select jsonb_build_object(
      'cifras', jsonb_build_array(
        jsonb_build_object('etiqueta','Pedidos abiertos','formato','numero','valor',
          (select count(*) from orders where company_id=p_company
             and status not in ('entregado','cancelado'))),
        jsonb_build_object('etiqueta','Ventas 30 días','formato','dinero','valor',
          (select coalesce(sum(total),0) from orders where company_id=p_company
             and status<>'cancelado' and order_date >= now()-interval '30 days')),
        jsonb_build_object('etiqueta','Ticket medio','formato','dinero','nota','30 días','valor',
          (select coalesce(round(avg(total)),0) from orders where company_id=p_company
             and status<>'cancelado' and order_date >= now()-interval '30 days')),
        jsonb_build_object('etiqueta','Productos activos','formato','numero','valor',
          (select count(*) from products where company_id=p_company and status='activo'))),
      'series', jsonb_build_array(
        jsonb_build_object('titulo','Ventas por semana','nota','Las últimas doce semanas.',
          'formato','dinero','leyenda', jsonb_build_array('Ventas'),
          'puntos', (select coalesce(jsonb_agg(jsonb_build_object(
                       'x', to_char(w,'DD/MM'), 'y', coalesce(v.total,0)) order by w), '[]'::jsonb)
            from generate_series(date_trunc('week', now()) - interval '11 weeks',
                                 date_trunc('week', now()), interval '1 week') w
            left join (select date_trunc('week', o.order_date) f, sum(o.total) total
                         from orders o where o.company_id=p_company and o.status<>'cancelado'
                          and o.order_date >= date_trunc('week', now()) - interval '11 weeks'
                        group by 1) v on v.f = w))),
      'listas', jsonb_build_array(
        jsonb_build_object(
          'titulo','Qué se vende más','nota','Por venta, en los últimos 90 días.',
          'columnas', jsonb_build_array(
            jsonb_build_object('k','n','t','Producto'),
            jsonb_build_object('k','cant','t','Cantidad','formato','numero'),
            jsonb_build_object('k','ventas','t','Ventas','formato','dinero')),
          'filas', (select coalesce(jsonb_agg(x order by (x->>'ventas')::numeric desc), '[]'::jsonb) from (
            select jsonb_build_object('n',pr.name,'cant',sum(oi.quantity_ordered),
                     'ventas',sum(oi.line_total)) x
              from order_items oi
              join orders o on o.id=oi.order_id and o.status<>'cancelado'
                           and o.order_date >= now()-interval '90 days'
              join products pr on pr.id=oi.product_id
             where oi.company_id=p_company
             group by pr.id,pr.name order by sum(oi.line_total) desc limit 8) s)),
        jsonb_build_object(
          'titulo','Cómo van los pedidos','nota','Todo lo que no está entregado ni cancelado.',
          'columnas', jsonb_build_array(
            jsonb_build_object('k','estado','t','Estado'),
            jsonb_build_object('k','n','t','Pedidos','formato','numero'),
            jsonb_build_object('k','monto','t','Monto','formato','dinero')),
          'filas', (select coalesce(jsonb_agg(x order by (x->>'orden')::int), '[]'::jsonb) from (
            select jsonb_build_object('estado', e.nombre, 'orden', e.orden,
                     'n', count(o.id), 'monto', coalesce(sum(o.total),0)) x
              from (values (1,'nuevo','Nuevo'),(2,'confirmado','Confirmado'),
                           (3,'en_preparacion','En preparación'),(4,'preparado','Preparado'),
                           (5,'en_reparto','En reparto')) as e(orden,clave,nombre)
              left join orders o on o.company_id=p_company and o.status::text = e.clave
             group by e.orden, e.nombre) s)))
    ) into r;

  when 'operations' then
    select jsonb_build_object(
      'cifras', jsonb_build_array(
        jsonb_build_object('etiqueta','Valor en bodega','formato','dinero','valor',
          (select coalesce(sum(quantity_on_hand*unit_cost),0) from inventory_lots
            where company_id=p_company and status='disponible')),
        jsonb_build_object('etiqueta','Lotes disponibles','formato','numero','valor',
          (select count(*) from inventory_lots where company_id=p_company and status='disponible')),
        jsonb_build_object('etiqueta','Bajo el mínimo','formato','numero','tono','aviso','valor',
          (select count(*) from v_product_stock where company_id=p_company
             and status='activo' and min_stock>0 and available<min_stock)),
        jsonb_build_object('etiqueta','Mermas del mes','formato','dinero','tono','malo','valor',
          (select coalesce(sum(cost),0) from losses where company_id=p_company
             and created_at >= date_trunc('month', now())))),
      'series', '[]'::jsonb,
      'listas', jsonb_build_array(
        jsonb_build_object(
          'titulo','Dónde está la plata en bodega','nota','Los productos con más valor almacenado.',
          'columnas', jsonb_build_array(
            jsonb_build_object('k','n','t','Producto'),
            jsonb_build_object('k','hay','t','Disponible','formato','numero'),
            jsonb_build_object('k','minimo','t','Mínimo','formato','numero'),
            jsonb_build_object('k','valor','t','Valor','formato','dinero')),
          'filas', (select coalesce(jsonb_agg(x order by (x->>'valor')::numeric desc), '[]'::jsonb) from (
            select jsonb_build_object('n',v.name,'hay',v.available,'minimo',v.min_stock,
                     'valor',v.stock_value) x
              from v_product_stock v
             where v.company_id=p_company and v.status='activo' and v.on_hand>0
             order by v.stock_value desc limit 8) s)),
        jsonb_build_object(
          'titulo','Últimas compras','nota','Por aquí entra lo que después se vende.',
          'columnas', jsonb_build_array(
            jsonb_build_object('k','codigo','t','Compra'),
            jsonb_build_object('k','prov','t','Proveedor'),
            jsonb_build_object('k','fecha','t','Fecha','formato','fecha'),
            jsonb_build_object('k','total','t','Total','formato','dinero')),
          'filas', (select coalesce(jsonb_agg(x order by (x->>'fecha') desc), '[]'::jsonb) from (
            select jsonb_build_object('codigo',c.code,'prov',coalesce(pv.name,'—'),
                     'fecha',c.purchase_date,'total',c.total) x
              from purchases c left join suppliers pv on pv.id=c.supplier_id
             where c.company_id=p_company
             order by c.purchase_date desc nulls last limit 6) s)),
        jsonb_build_object(
          'titulo','Por qué se pierde','nota','Mermas de los últimos 90 días, por motivo.',
          'columnas', jsonb_build_array(
            jsonb_build_object('k','motivo','t','Motivo'),
            jsonb_build_object('k','n','t','Veces','formato','numero'),
            jsonb_build_object('k','costo','t','Costo','formato','dinero','tono','malo')),
          'filas', (select coalesce(jsonb_agg(x order by (x->>'costo')::numeric desc), '[]'::jsonb) from (
            select jsonb_build_object('motivo',l.reason::text,'n',count(*),'costo',coalesce(sum(l.cost),0)) x
              from losses l
             where l.company_id=p_company and l.created_at >= now()-interval '90 days'
             group by l.reason order by sum(l.cost) desc limit 8) s)))
    ) into r;

  when 'delivery' then
    select jsonb_build_object(
      'cifras', jsonb_build_array(
        jsonb_build_object('etiqueta','Pendientes','formato','numero','valor',
          (select count(*) from deliveries where company_id=p_company and status='pendiente')),
        jsonb_build_object('etiqueta','En camino','formato','numero','tono','aviso','valor',
          (select count(*) from deliveries where company_id=p_company and status='en_camino')),
        jsonb_build_object('etiqueta','Entregadas 7 días','formato','numero','tono','ok','valor',
          (select count(*) from deliveries where company_id=p_company and status='entregada'
             and delivered_at >= now()-interval '7 days')),
        jsonb_build_object('etiqueta','Fallidas 30 días','formato','numero','tono','malo','valor',
          (select count(*) from deliveries where company_id=p_company and status='fallida'
             and scheduled_date >= current_date-30))),
      'series', '[]'::jsonb,
      'listas', jsonb_build_array(
        jsonb_build_object(
          'titulo','Lo que sale hoy y mañana','nota','Programado, sin entregar todavía.',
          'columnas', jsonb_build_array(
            jsonb_build_object('k','codigo','t','Entrega'),
            jsonb_build_object('k','cliente','t','Destino'),
            jsonb_build_object('k','comuna','t','Comuna'),
            jsonb_build_object('k','fecha','t','Programada','formato','fecha'),
            jsonb_build_object('k','estado','t','Estado')),
          'filas', (select coalesce(jsonb_agg(x order by (x->>'fecha')), '[]'::jsonb) from (
            select jsonb_build_object('codigo',d.code,'cliente',coalesce(cu.name,'—'),
                     'comuna',cu.comuna,'fecha',d.scheduled_date,'estado',d.status::text) x
              from deliveries d
              left join orders o on o.id=d.order_id
              left join customers cu on cu.id=o.customer_id
             where d.company_id=p_company and d.status<>'entregada'
               and d.scheduled_date between current_date and current_date+1
             order by d.scheduled_date, d.sequence nulls last limit 10) s)),
        jsonb_build_object(
          'titulo','Rutas próximas','nota','Una ruta agrupa las entregas de un día.',
          'columnas', jsonb_build_array(
            jsonb_build_object('k','n','t','Ruta'),
            jsonb_build_object('k','fecha','t','Fecha','formato','fecha'),
            jsonb_build_object('k','paradas','t','Paradas','formato','numero'),
            jsonb_build_object('k','cobrado','t','Cobrado','formato','dinero')),
          'filas', (select coalesce(jsonb_agg(x order by (x->>'fecha') desc), '[]'::jsonb) from (
            select jsonb_build_object('n',rt.name,'fecha',rt.route_date,
                     'paradas',count(d.id),'cobrado',coalesce(sum(d.amount_collected),0)) x
              from routes rt left join deliveries d on d.route_id=rt.id
             where rt.company_id=p_company and rt.route_date >= current_date-7
             group by rt.id,rt.name,rt.route_date
             order by rt.route_date desc limit 6) s)))
    ) into r;

  when 'finance' then
    select jsonb_build_object(
      'cifras', jsonb_build_array(
        jsonb_build_object('etiqueta','Por cobrar','formato','dinero','valor',
          (select coalesce(sum(total-amount_paid),0) from orders where company_id=p_company
             and status<>'cancelado' and total>amount_paid)),
        jsonb_build_object('etiqueta','Vencido','formato','dinero','tono','malo','valor',
          (select coalesce(sum(total-amount_paid),0) from orders where company_id=p_company
             and status<>'cancelado' and total>amount_paid and due_date<current_date)),
        jsonb_build_object('etiqueta','Por pagar','formato','dinero','nota','compras y apertura','valor',
          coalesce((select sum(total-amount_paid) from purchases
                     where company_id=p_company and status='recibida' and total>amount_paid),0)
        + coalesce((select sum(amount-amount_paid) from opening_payables
                     where company_id=p_company and amount>amount_paid),0)),
        jsonb_build_object('etiqueta','Cobrado 30 días','formato','dinero','tono','ok','valor',
          (select coalesce(sum(amount),0) from payments where company_id=p_company
             and direction='cobro' and paid_at >= current_date-30))),
      'series', jsonb_build_array(
        jsonb_build_object('titulo','Lo que entra y lo que sale','nota','Pagos registrados, mes a mes.',
          'formato','dinero','leyenda', jsonb_build_array('Cobros','Pagos'),
          'puntos', (select coalesce(jsonb_agg(jsonb_build_object(
                       'x', to_char(m,'YYYY-MM'), 'formato_x', 'mes',
                       'y', coalesce(v.cobros,0), 'y2', coalesce(v.pagos,0)) order by m), '[]'::jsonb)
            from generate_series(date_trunc('month', now()) - interval '5 months',
                                 date_trunc('month', now()), interval '1 month') m
            left join (select date_trunc('month', p.paid_at) f,
                              sum(p.amount) filter (where p.direction='cobro') cobros,
                              sum(p.amount) filter (where p.direction='pago')  pagos
                         from payments p where p.company_id=p_company
                          and p.paid_at >= (date_trunc('month', now()) - interval '5 months')::date
                        group by 1) v on v.f = m))),
      'listas', jsonb_build_array(
        jsonb_build_object(
          'titulo','Últimos movimientos','nota','Cada pago ajusta solo el saldo de su pedido o compra.',
          'columnas', jsonb_build_array(
            jsonb_build_object('k','codigo','t','Pago'),
            jsonb_build_object('k','dir','t','Dirección'),
            jsonb_build_object('k','quien','t','Quién'),
            jsonb_build_object('k','fecha','t','Fecha','formato','fecha'),
            jsonb_build_object('k','monto','t','Monto','formato','dinero')),
          'filas', (select coalesce(jsonb_agg(x order by (x->>'fecha') desc), '[]'::jsonb) from (
            select jsonb_build_object('codigo',pg.code,
                     'dir', case pg.direction::text when 'cobro' then 'Entra' else 'Sale' end,
                     'quien', coalesce(cu.name, pv.name, '—'),
                     'fecha',pg.paid_at,'monto',pg.amount) x
              from payments pg
              left join customers cu on cu.id=pg.customer_id
              left join suppliers pv on pv.id=pg.supplier_id
             where pg.company_id=p_company
             order by pg.paid_at desc nulls last limit 10) s)))
    ) into r;

  when 'food' then
    select jsonb_build_object(
      'cifras', jsonb_build_array(
        jsonb_build_object('etiqueta','Procesos del mes','formato','numero','valor',
          (select count(*) from processing_orders where company_id=p_company
             and created_at >= date_trunc('month', now()))),
        jsonb_build_object('etiqueta','Rendimiento medio','formato','porcentaje','nota','90 días','valor',
          (select coalesce(round(avg(yield_pct)),0) from processing_orders
            where company_id=p_company and yield_pct is not null
              and created_at >= now()-interval '90 days')),
        jsonb_build_object('etiqueta','Merma acumulada','formato','numero','tono','aviso','valor',
          (select coalesce(sum(waste_quantity),0) from processing_orders
            where company_id=p_company and created_at >= now()-interval '90 days')),
        jsonb_build_object('etiqueta','Especies','formato','numero','valor',
          (select count(*) from fish_species where company_id=p_company and status='activo'))),
      'series', '[]'::jsonb,
      'listas', jsonb_build_array(
        jsonb_build_object(
          'titulo','Rendimiento por producto','nota','Cuánto sale de lo que entra, en los últimos 90 días.',
          'columnas', jsonb_build_array(
            jsonb_build_object('k','n','t','Entra'),
            jsonb_build_object('k','veces','t','Procesos','formato','numero'),
            jsonb_build_object('k','entra','t','Cantidad','formato','numero'),
            jsonb_build_object('k','rend','t','Rendimiento','formato','porcentaje')),
          'filas', (select coalesce(jsonb_agg(x order by (x->>'veces')::int desc), '[]'::jsonb) from (
            select jsonb_build_object('n',pr.name,'veces',count(*),
                     'entra',sum(po.input_quantity),'rend',round(avg(po.yield_pct))) x
              from processing_orders po
              left join products pr on pr.id=po.source_product_id
             where po.company_id=p_company and po.created_at >= now()-interval '90 days'
             group by pr.id,pr.name order by count(*) desc limit 8) s)))
    ) into r;

  when 'agenda' then
    select jsonb_build_object(
      'cifras', jsonb_build_array(
        jsonb_build_object('etiqueta','Hoy','formato','numero','valor',
          (select count(*) from agenda where company_id=p_company and on_date=current_date)),
        jsonb_build_object('etiqueta','Esta semana','formato','numero','valor',
          (select count(*) from agenda where company_id=p_company
             and on_date between current_date and current_date+7)),
        jsonb_build_object('etiqueta','Tareas abiertas','formato','numero','valor',
          (select count(*) from tasks where company_id=p_company and public.tarea_abierta(status))),
        jsonb_build_object('etiqueta','Tareas vencidas','formato','numero','tono','malo','valor',
          (select count(*) from tasks where company_id=p_company
             and public.tarea_abierta(status) and due_at < current_date))),
      'series', '[]'::jsonb,
      'listas', jsonb_build_array(
        jsonb_build_object(
          'titulo','Lo que viene','nota','Los próximos catorce días.',
          'columnas', jsonb_build_array(
            jsonb_build_object('k','fecha','t','Cuándo','formato','fecha'),
            jsonb_build_object('k','hora','t','Hora'),
            jsonb_build_object('k','t','t','Compromiso')),
          'filas', (select coalesce(jsonb_agg(x order by (x->>'fecha'), (x->>'hora')), '[]'::jsonb) from (
            select jsonb_build_object('fecha',a.on_date,'hora',coalesce(a.at_time,'—'),'t',a.title) x
              from agenda a
             where a.company_id=p_company
               and a.on_date between current_date and current_date+14
             order by a.on_date, a.at_time limit 10) s)),
        jsonb_build_object(
          'titulo','Tareas por vencer','nota','Abiertas, ordenadas por fecha de entrega.',
          'columnas', jsonb_build_array(
            jsonb_build_object('k','t','t','Tarea'),
            jsonb_build_object('k','prioridad','t','Prioridad'),
            jsonb_build_object('k','vence','t','Vence','formato','fecha')),
          'filas', (select coalesce(jsonb_agg(x order by (x->>'vence')), '[]'::jsonb) from (
            select jsonb_build_object('t',tk.title,'prioridad',coalesce(tk.priority,'—'),'vence',tk.due_at) x
              from tasks tk
             where tk.company_id=p_company and public.tarea_abierta(tk.status)
             order by tk.due_at nulls last limit 10) s)))
    ) into r;

  when 'creator' then
    select jsonb_build_object(
      'cifras', jsonb_build_array(
        jsonb_build_object('etiqueta','Proyectos activos','formato','numero','valor',
          (select count(*) from projects where company_id=p_company
             and coalesce(status,'') not in ('Cerrado','Finalizado','Cancelado'))),
        jsonb_build_object('etiqueta','Presupuesto en curso','formato','dinero','valor',
          (select coalesce(sum(budget),0) from projects where company_id=p_company
             and coalesce(status,'') not in ('Cerrado','Finalizado','Cancelado'))),
        jsonb_build_object('etiqueta','Cobrado','formato','dinero','tono','ok','valor',
          (select coalesce(sum(paid),0) from projects where company_id=p_company)),
        jsonb_build_object('etiqueta','Cotizaciones','formato','numero','nota','90 días','valor',
          (select count(*) from quotes where company_id=p_company
             and created_at >= now()-interval '90 days'))),
      'series', '[]'::jsonb,
      'listas', jsonb_build_array(
        jsonb_build_object(
          'titulo','Proyectos en curso','nota','Ordenados por lo que falta cobrar.',
          'columnas', jsonb_build_array(
            jsonb_build_object('k','t','t','Proyecto'),
            jsonb_build_object('k','cliente','t','Cliente'),
            jsonb_build_object('k','estado','t','Estado'),
            jsonb_build_object('k','avance','t','Avance','formato','porcentaje'),
            jsonb_build_object('k','saldo','t','Por cobrar','formato','dinero')),
          'filas', (select coalesce(jsonb_agg(x order by (x->>'saldo')::numeric desc), '[]'::jsonb) from (
            select jsonb_build_object('t',p.title,'cliente',coalesce(p.client,'—'),
                     'estado',coalesce(p.status,'—'),'avance',coalesce(p.pct,0),
                     'saldo',coalesce(p.budget,0)-coalesce(p.paid,0)) x
              from projects p
             where p.company_id=p_company
               and coalesce(p.status,'') not in ('Cerrado','Finalizado','Cancelado')
             order by coalesce(p.budget,0)-coalesce(p.paid,0) desc limit 8) s)),
        jsonb_build_object(
          'titulo','Últimas cotizaciones','nota','',
          'columnas', jsonb_build_array(
            jsonb_build_object('k','t','t','Concepto'),
            jsonb_build_object('k','cliente','t','Cliente'),
            jsonb_build_object('k','estado','t','Estado'),
            jsonb_build_object('k','total','t','Total','formato','dinero')),
          'filas', (select coalesce(jsonb_agg(x order by (x->>'creado') desc), '[]'::jsonb) from (
            select jsonb_build_object('t',q.title,'cliente',coalesce(q.client_name,'—'),
                     'estado',coalesce(q.status,'—'),'total',coalesce(q.total,0),
                     'creado',q.created_at) x
              from quotes q where q.company_id=p_company
             order by q.created_at desc limit 8) s)))
    ) into r;

  else
    r := '{}'::jsonb;
  end case;

  return coalesce(r, '{}'::jsonb);
end;
$function$;

-- suscripcion_fija_la_linea()
CREATE OR REPLACE FUNCTION public.suscripcion_fija_la_linea()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_linea uuid;
begin
  select product_line_id into v_linea from public.plans where id = new.plan_id;
  if v_linea is null then
    return new;
  end if;
  update public.companies
     set product_line_id = v_linea
   where id = new.company_id
     and product_line_id is distinct from v_linea;
  return new;
end;
$function$;

-- uso_del_plan(p_company uuid, p_clave text)
CREATE OR REPLACE FUNCTION public.uso_del_plan(p_company uuid, p_clave text)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare n bigint := 0;
begin
  if p_clave = 'personas' then
    select count(*) into n from public.company_members
     where company_id = p_company and status <> 'suspended';
  elsif p_clave = 'clientes' then
    select (select count(*) from public.customers where company_id = p_company)
         + (select count(*) from public.clients   where company_id = p_company)
      into n;
  elsif p_clave = 'productos' then
    select count(*) into n from public.products where company_id = p_company;
  elsif p_clave = 'documentos_mes' then
    select count(*) into n from public.orders
     where company_id = p_company and created_at >= date_trunc('month', now());
  elsif p_clave = 'bodegas' then
    select count(*) into n from public.locations
     where company_id = p_company and coalesce(type,'') <> 'vehiculo';
  elsif p_clave = 'proyectos_activos' then
    select count(*) into n from public.projects
     where company_id = p_company
       and coalesce(archive,'') = ''
       and coalesce(status,'') <> 'Cerrado';
  elsif p_clave = 'cotizaciones_mes' then
    select count(*) into n from public.quotes
     where company_id = p_company and created_at >= date_trunc('month', now());
  end if;
  return coalesce(n, 0);
end $function$;

