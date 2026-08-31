-- 0058 · COMMERCE · paneles, series y margenes
-- El original agregaba SIN filtrar empresa y era SECURITY DEFINER: el panel
-- de una empresa habria sumado las ventas de la otra. Es la fuga mas dificil
-- de notar, porque no da error: da un numero mas grande.
--
-- Se corrige de dos formas a la vez: pasan a SECURITY INVOKER (el RLS filtra)
-- y ademas llevan filtro explicito por current_company(), porque un usuario
-- que pertenece a dos empresas veria las dos sumadas.

create or replace function public.dashboard_kpis()
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  with c as (select public.current_company() as id)
  select jsonb_build_object(
    'ventas_hoy',   (select coalesce(sum(total),0) from public.orders, c
                      where orders.company_id = c.id and status <> 'cancelado' and order_date::date = current_date),
    'ventas_semana',(select coalesce(sum(total),0) from public.orders, c
                      where orders.company_id = c.id and status <> 'cancelado' and order_date >= date_trunc('week', now())),
    'ventas_mes',   (select coalesce(sum(total),0) from public.orders, c
                      where orders.company_id = c.id and status <> 'cancelado' and order_date >= date_trunc('month', now())),
    'compras_mes',  (select coalesce(sum(total),0) from public.purchases, c
                      where purchases.company_id = c.id and status = 'recibida' and purchase_date >= date_trunc('month', now())::date),
    'margen_mes',   (select coalesce(sum(total - cost_total),0) from public.orders, c
                      where orders.company_id = c.id and status <> 'cancelado' and order_date >= date_trunc('month', now())),
    'pedidos_pendientes',    (select count(*) from public.orders, c
                      where orders.company_id = c.id and status in ('nuevo','confirmado','en_preparacion','preparado')),
    'pedidos_en_reparto',    (select count(*) from public.orders, c
                      where orders.company_id = c.id and status = 'en_reparto'),
    'pedidos_entregados_hoy',(select count(*) from public.orders, c
                      where orders.company_id = c.id and status = 'entregado' and delivered_at::date = current_date),
    'stock_total',  (select coalesce(sum(quantity_on_hand),0) from public.inventory_lots, c
                      where inventory_lots.company_id = c.id and status = 'disponible'),
    'stock_valor',  (select coalesce(sum(quantity_on_hand * unit_cost),0) from public.inventory_lots, c
                      where inventory_lots.company_id = c.id and status = 'disponible'),
    'productos_stock_bajo', (select count(*) from public.v_product_stock v, c
                      where v.company_id = c.id and v.min_stock > 0 and v.available < v.min_stock and v.status = 'activo'),
    'clientes_activos', (select count(*) from public.customers, c
                      where customers.company_id = c.id and status = 'activo'),
    'cuentas_por_cobrar', (select coalesce(sum(total - amount_paid),0) from public.orders, c
                      where orders.company_id = c.id and status <> 'cancelado' and payment_status <> 'pagado'),
    'cuentas_vencidas', (select coalesce(sum(total - amount_paid),0) from public.orders, c
                      where orders.company_id = c.id and status <> 'cancelado' and payment_status <> 'pagado' and due_date < current_date)
  );
$$;

create or replace function public.finance_kpis()
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare v_venta numeric; v_costo numeric; v_fijos numeric; v_dias int; v_transcurridos int; v_c uuid;
begin
  v_c := public.current_company();
  perform public.assert_company(v_c, 60);
  if not (public.is_admin() or public.has_perm('payments','read')) then
    raise exception 'Sin permiso para ver informacion financiera';
  end if;

  select coalesce(sum(total), 0), coalesce(sum(cost_total), 0) into v_venta, v_costo
    from public.orders
   where company_id = v_c and status <> 'cancelado' and order_date >= date_trunc('month', now());

  v_fijos := coalesce(public.company_setting(v_c,'operacion','costos_fijos_mensuales')::numeric, 0);
  v_dias  := extract(day from (date_trunc('month', now()) + interval '1 month - 1 day'));
  v_transcurridos := extract(day from now());

  return jsonb_build_object(
    'venta_mes', v_venta, 'costo_mes', v_costo,
    'margen_bruto', v_venta - v_costo,
    'margen_bruto_pct', case when v_venta > 0 then round(((v_venta - v_costo) / v_venta) * 100, 1) else 0 end,
    'costos_fijos_mes', v_fijos,
    'costos_fijos_proporcional', round(v_fijos * (v_transcurridos::numeric / v_dias)),
    'resultado_estimado', (v_venta - v_costo) - round(v_fijos * (v_transcurridos::numeric / v_dias)),
    'punto_equilibrio_venta', case when v_venta > 0 and (v_venta - v_costo) > 0
        then round(v_fijos / ((v_venta - v_costo) / v_venta)) else 0 end,
    'por_cobrar', (select coalesce(sum(saldo), 0) from public.v_cuentas_por_cobrar where company_id = v_c),
    'vencido',    (select coalesce(sum(saldo), 0) from public.v_cuentas_por_cobrar where company_id = v_c and dias_atraso > 0),
    'por_pagar',  (select coalesce(sum(saldo), 0) from public.v_cuentas_por_pagar where company_id = v_c),
    'cobrado_mes',(select coalesce(sum(amount), 0) from public.payments
                    where company_id = v_c and direction = 'cobro' and paid_at >= date_trunc('month', now())),
    'pagado_mes', (select coalesce(sum(amount), 0) from public.payments
                    where company_id = v_c and direction = 'pago'  and paid_at >= date_trunc('month', now()))
  );
end $$;

create or replace function public.sales_series(_days integer default 30)
returns table(dia date, ventas numeric, compras numeric, margen numeric)
language sql stable security invoker set search_path = public, pg_temp as $$
  with c as (select public.current_company() as id),
       dias as (select generate_series(current_date - (_days - 1), current_date, interval '1 day')::date as dia)
  select d.dia,
    coalesce((select sum(o.total) from public.orders o, c
               where o.company_id = c.id and o.order_date::date = d.dia and o.status <> 'cancelado'),0),
    coalesce((select sum(p.total) from public.purchases p, c
               where p.company_id = c.id and p.purchase_date = d.dia and p.status = 'recibida'),0),
    coalesce((select sum(o.total - o.cost_total) from public.orders o, c
               where o.company_id = c.id and o.order_date::date = d.dia and o.status <> 'cancelado'),0)
  from dias d order by d.dia;
$$;

create or replace function public.margin_by_customer(_desde date, _hasta date)
returns table(customer_id uuid, cliente text, pedidos bigint, kilos numeric,
              venta numeric, costo numeric, margen numeric, margen_pct numeric)
language sql stable security invoker set search_path = public, pg_temp as $$
  select c.id, c.name, count(distinct o.id),
    coalesce(sum(coalesce(i.quantity_prepared, i.quantity_ordered)), 0),
    coalesce(sum(i.line_total), 0),
    coalesce(sum(coalesce(i.quantity_prepared, i.quantity_ordered) * i.unit_cost), 0),
    coalesce(sum(i.line_total), 0) - coalesce(sum(coalesce(i.quantity_prepared, i.quantity_ordered) * i.unit_cost), 0),
    case when coalesce(sum(i.line_total), 0) > 0
      then round(((coalesce(sum(i.line_total), 0) - coalesce(sum(coalesce(i.quantity_prepared, i.quantity_ordered) * i.unit_cost), 0))
                  / sum(i.line_total)) * 100, 1) else 0 end
  from public.customers c
  join public.orders o on o.customer_id = c.id and o.status <> 'cancelado'
    and o.order_date::date between _desde and _hasta
  join public.order_items i on i.order_id = o.id
  where c.company_id = public.current_company()
  group by c.id, c.name order by 7 desc;
$$;

create or replace function public.margin_by_product(_desde date, _hasta date)
returns table(product_id uuid, producto text, kilos numeric, venta numeric,
              costo numeric, margen numeric, margen_pct numeric)
language sql stable security invoker set search_path = public, pg_temp as $$
  select p.id, p.name,
    sum(coalesce(i.quantity_prepared, i.quantity_ordered)),
    sum(i.line_total),
    sum(coalesce(i.quantity_prepared, i.quantity_ordered) * i.unit_cost),
    sum(i.line_total) - sum(coalesce(i.quantity_prepared, i.quantity_ordered) * i.unit_cost),
    case when sum(i.line_total) > 0
      then round(((sum(i.line_total) - sum(coalesce(i.quantity_prepared, i.quantity_ordered) * i.unit_cost))
                  / sum(i.line_total)) * 100, 1) else 0 end
  from public.order_items i
  join public.orders o on o.id = i.order_id
  join public.products p on p.id = i.product_id
  where o.status <> 'cancelado' and o.order_date::date between _desde and _hasta
    and p.company_id = public.current_company()
  group by p.id, p.name having sum(i.line_total) > 0 order by 6 desc;
$$;

do $$
declare f text;
begin
  foreach f in array array['dashboard_kpis()','finance_kpis()','sales_series(integer)',
    'margin_by_customer(date,date)','margin_by_product(date,date)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;