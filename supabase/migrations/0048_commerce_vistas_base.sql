-- ===========================================================
-- 0048 · COMMERCE · vistas (parte 1)
-- Todas con security_invoker: se ejecutan con los permisos de quien consulta,
-- así que el RLS de las tablas base las filtra solas por empresa.
-- Se agrega company_id a la salida (columna nueva, no rompe nada).
-- ===========================================================
create or replace view public.v_product_stock with (security_invoker = on) as
 select p.company_id, p.id as product_id, p.name, p.sku, p.base_unit, p.min_stock,
        p.sale_price, p.avg_cost, p.status, p.category_id, p.species_id,
        coalesce(sum(l.quantity_on_hand)  filter (where l.status='disponible'), 0::numeric) as on_hand,
        coalesce(sum(l.quantity_reserved) filter (where l.status='disponible'), 0::numeric) as reserved,
        coalesce(sum(l.quantity_available)filter (where l.status='disponible'), 0::numeric) as available,
        coalesce(sum(l.quantity_on_hand * l.unit_cost) filter (where l.status='disponible'), 0::numeric) as stock_value,
        count(l.id) filter (where l.status='disponible' and l.quantity_on_hand > 0::numeric) as active_lots
 from public.products p left join public.inventory_lots l on l.product_id = p.id
 group by p.id;

create or replace view public.v_customer_balance with (security_invoker = on) as
 select c.company_id, c.id as customer_id, c.name, c.customer_type,
        count(o.id) filter (where o.status <> 'cancelado') as orders_count,
        coalesce(sum(o.total)       filter (where o.status <> 'cancelado'), 0::numeric) as total_invoiced,
        coalesce(sum(o.amount_paid) filter (where o.status <> 'cancelado'), 0::numeric) as total_paid,
        coalesce(sum(o.total - o.amount_paid) filter (
          where o.status <> 'cancelado' and o.payment_status <> 'pagado'), 0::numeric) as balance_due,
        coalesce(sum(o.total - o.amount_paid) filter (
          where o.status <> 'cancelado' and o.payment_status <> 'pagado' and o.due_date < current_date), 0::numeric) as overdue,
        max(o.order_date) filter (where o.status <> 'cancelado') as last_order_at
 from public.customers c left join public.orders o on o.customer_id = c.id
 group by c.id;

create or replace view public.v_clientes_mapa with (security_invoker = on) as
 select c.company_id, c.id, c.name, c.customer_type, c.address, c.comuna, c.phone, c.whatsapp,
        c.latitude, c.longitude, c.status,
        b.orders_count, b.total_invoiced, b.balance_due, b.overdue, b.last_order_at
 from public.customers c left join public.v_customer_balance b on b.customer_id = c.id;

create or replace view public.v_order_profit with (security_invoker = on) as
 select o.company_id, o.id as order_id, o.code, o.customer_id, o.status, o.order_date,
        o.total, o.cost_total, o.freight, (o.total - o.cost_total) as gross_margin,
        case when o.total > 0::numeric
             then round(((o.total - o.cost_total) / o.total) * 100::numeric, 2)
             else 0::numeric end as margin_pct
 from public.orders o;

create or replace view public.v_cuentas_por_cobrar with (security_invoker = on) as
 select o.company_id, 'pedido'::text as origen, o.id as ref_id, o.id as order_id,
        null::uuid as receivable_id, o.code, o.customer_id, c.name as cliente, c.phone, c.whatsapp,
        o.due_date, o.total, o.amount_paid, (o.total - o.amount_paid) as saldo, o.invoice_number,
        greatest(current_date - o.due_date, 0) as dias_atraso,
        case when o.due_date is null then 'sin_plazo'
             when current_date <= o.due_date then 'al_dia'
             when (current_date - o.due_date) <= 15 then 'atraso_leve'
             when (current_date - o.due_date) <= 30 then 'atraso_medio'
             else 'atraso_grave' end as tramo
 from public.orders o join public.customers c on c.id = o.customer_id
 where o.status <> 'cancelado' and (o.total - o.amount_paid) > 0::numeric
 union all
 select r.company_id, 'saldo_inicial'::text, r.id, null::uuid, r.id, r.code, r.customer_id,
        coalesce(c.name, r.customer_name), c.phone, c.whatsapp,
        r.due_date, r.amount, r.amount_paid, (r.amount - r.amount_paid), r.document_number,
        greatest(current_date - r.due_date, 0),
        case when r.due_date is null then 'sin_plazo'
             when current_date <= r.due_date then 'al_dia'
             when (current_date - r.due_date) <= 15 then 'atraso_leve'
             when (current_date - r.due_date) <= 30 then 'atraso_medio'
             else 'atraso_grave' end
 from public.opening_receivables r left join public.customers c on c.id = r.customer_id
 where (r.amount - r.amount_paid) > 0::numeric;

create or replace view public.v_cuentas_por_pagar with (security_invoker = on) as
 select p.company_id, 'compra'::text as origen, p.id as ref_id, p.id as purchase_id,
        null::uuid as payable_id, p.code, p.supplier_id, s.name as proveedor, s.phone,
        p.purchase_date as issued_at, p.due_date, p.total, p.amount_paid,
        (p.total - p.amount_paid) as saldo,
        greatest(current_date - coalesce(p.due_date, p.purchase_date + s.payment_terms_days), 0) as dias_atraso
 from public.purchases p join public.suppliers s on s.id = p.supplier_id
 where p.status = 'recibida' and (p.total - p.amount_paid) > 0::numeric
 union all
 select a.company_id, 'saldo_inicial'::text, a.id, null::uuid, a.id, a.code, a.supplier_id,
        coalesce(s.name, a.supplier_name), s.phone, a.issued_at, a.due_date,
        a.amount, a.amount_paid, (a.amount - a.amount_paid),
        greatest(current_date - a.due_date, 0)
 from public.opening_payables a left join public.suppliers s on s.id = a.supplier_id
 where (a.amount - a.amount_paid) > 0::numeric;
