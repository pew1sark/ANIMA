-- ===========================================================
-- 0049 · COMMERCE · vistas operativas (parte 2)
-- Dos correcciones multiempresa sobre el original de JLIZ:
--   · los históricos agrupaban sin empresa: mezclarían datos de dos empresas
--     en la misma fila. Ahora agrupan por company_id.
--   · v_hoja_ruta usaba is_admin() y auth_role() de JLIZ. Se reemplaza por el
--     modelo de la plataforma: el repartidor ve lo suyo, el resto necesita
--     nivel empleado (40).
-- ===========================================================
create or replace view public.v_stock_operativo with (security_invoker = on) as
 select p.company_id, p.id as product_id, p.name, p.sku, p.presentation, p.base_unit, p.min_stock,
        coalesce(sum(l.quantity_on_hand)  filter (where l.status='disponible'), 0::numeric) as on_hand,
        coalesce(sum(l.quantity_reserved) filter (where l.status='disponible'), 0::numeric) as reserved,
        coalesce(sum(l.quantity_available)filter (where l.status='disponible'), 0::numeric) as available,
        (p.min_stock > 0::numeric and
         coalesce(sum(l.quantity_available) filter (where l.status='disponible'), 0::numeric) < p.min_stock) as bajo_minimo,
        count(l.id) filter (where l.status='disponible' and l.quantity_on_hand > 0::numeric) as lotes,
        min(l.expires_at) filter (where l.status='disponible' and l.quantity_on_hand > 0::numeric) as proximo_vencimiento
 from public.products p left join public.inventory_lots l on l.product_id = p.id
 where p.status = 'activo' group by p.id;

create or replace view public.v_lotes_operativos with (security_invoker = on) as
 select l.company_id, l.id, l.code, l.product_id, p.name as product_name, p.sku,
        l.quantity_on_hand, l.quantity_reserved, l.quantity_available, l.unit,
        l.received_at, l.expires_at, l.origin, l.status,
        coalesce(loc.name, l.location) as ubicacion
 from public.inventory_lots l
 join public.products p on p.id = l.product_id
 left join public.locations loc on loc.id = l.location_id
 where l.status = 'disponible' and l.quantity_on_hand > 0::numeric;

create or replace view public.v_pedidos_operativos with (security_invoker = on) as
 select o.company_id, o.id as order_id, o.code, o.status, c.name as cliente,
        c.phone as telefono, c.whatsapp,
        coalesce(a.address, c.address) as direccion, coalesce(a.comuna, c.comuna) as comuna,
        o.delivery_date, o.delivery_window, o.notes, o.driver_id, o.prepared_by,
        o.order_date, o.prepared_at, o.delivered_at,
        (select coalesce(sum(coalesce(i.quantity_prepared, i.quantity_ordered)), 0::numeric)
           from public.order_items i where i.order_id = o.id) as total_kilos,
        (select count(*) from public.order_items i where i.order_id = o.id) as lineas
 from public.orders o
 join public.customers c on c.id = o.customer_id
 left join public.customer_addresses a on a.id = o.address_id
 where o.status <> 'cancelado';

create or replace view public.v_pedido_items_operativos with (security_invoker = on) as
 select i.company_id, i.id as item_id, i.order_id, i.product_id, p.name as producto, p.sku,
        i.quantity_ordered, i.quantity_prepared, i.gross_weight, i.ice_weight, i.unit,
        i.lot_id, l.code as lote
 from public.order_items i
 join public.products p on p.id = i.product_id
 left join public.inventory_lots l on l.id = i.lot_id;

create or replace view public.v_hoja_ruta with (security_invoker = on) as
 select d.company_id, d.id as delivery_id, d.code, d.order_id, o.code as pedido,
        c.name as cliente, c.phone as telefono, c.whatsapp,
        coalesce(a.address, c.address) as direccion, coalesce(a.comuna, c.comuna) as comuna,
        coalesce(a.latitude, c.latitude) as latitude, coalesce(a.longitude, c.longitude) as longitude,
        o.delivery_window as horario, d.status, d.sequence, d.scheduled_date,
        d.started_at, d.delivered_at, d.received_by_name, d.driver_id, o.notes,
        (select coalesce(sum(coalesce(i.quantity_prepared, i.quantity_ordered)), 0::numeric)
           from public.order_items i where i.order_id = o.id) as total_kilos
 from public.deliveries d
 join public.orders o on o.id = d.order_id
 join public.customers c on c.id = o.customer_id
 left join public.customer_addresses a on a.id = o.address_id
 where d.driver_id = (select auth.uid()) or public.has_company_level(d.company_id, 40);

create or replace view public.v_reportes_operativos with (security_invoker = on) as
 with dias as (select generate_series(current_date - 29, current_date, interval '1 day')::date as dia),
      empresas as (select distinct company_id from public.orders
                   union select distinct company_id from public.inventory_movements)
 select e.company_id, d.dia,
   (select count(*) from public.orders o where o.order_date::date = d.dia
      and o.status <> 'cancelado' and o.company_id = e.company_id) as pedidos,
   (select count(*) from public.orders o where o.delivered_at::date = d.dia
      and o.company_id = e.company_id) as entregados,
   (select coalesce(sum(m.quantity),0::numeric) from public.inventory_movements m
      where m.created_at::date = d.dia and m.type = 'entrada_compra' and m.company_id = e.company_id) as kilos_recibidos,
   (select coalesce(sum(m.quantity),0::numeric) from public.inventory_movements m
      where m.created_at::date = d.dia and m.type = 'salida_venta' and m.company_id = e.company_id) as kilos_despachados,
   (select coalesce(sum(l.quantity),0::numeric) from public.losses l
      where l.created_at::date = d.dia and l.reason <> 'merma_proceso' and l.company_id = e.company_id) as kilos_merma,
   (select coalesce(sum(pr.output_quantity),0::numeric) from public.processing_orders pr
      where pr.created_at::date = d.dia and pr.company_id = e.company_id) as kilos_procesados
 from dias d cross join empresas e;

create or replace view public.v_historico_mensual with (security_invoker = on) as
 select company_id, date_trunc('month', fecha::timestamptz)::date as mes,
        count(*) filter (where not es_nota_credito) as documentos,
        count(distinct rut) as proveedores,
        coalesce(sum(monto_total) filter (where not es_nota_credito), 0::numeric) as compras,
        coalesce(sum(monto_total) filter (where es_nota_credito), 0::numeric) as notas_credito,
        coalesce(sum(monto_total), 0::numeric) as compra_neta,
        coalesce(avg(monto_total) filter (where not es_nota_credito), 0::numeric) as promedio_documento
 from public.purchase_history
 group by company_id, date_trunc('month', fecha::timestamptz)::date;

create or replace view public.v_historico_proveedores with (security_invoker = on) as
 with total as (select company_id, nullif(sum(monto_total), 0::numeric) as t
                from public.purchase_history where not es_nota_credito group by company_id)
 select h.company_id, h.rut, max(h.razon_social) as razon_social,
        (max(h.supplier_id::text))::uuid as supplier_id,
        count(*) filter (where not h.es_nota_credito) as documentos,
        coalesce(sum(h.monto_total) filter (where not h.es_nota_credito), 0::numeric) as compras,
        coalesce(sum(h.monto_total) filter (where h.es_nota_credito), 0::numeric) as notas_credito,
        round((coalesce(sum(h.monto_total) filter (where not h.es_nota_credito), 0::numeric)
               / (select t.t from total t where t.company_id = h.company_id)) * 100::numeric, 2) as participacion_pct,
        min(h.fecha) as primera_compra, max(h.fecha) as ultima_compra,
        round(coalesce(avg(h.monto_total) filter (where not h.es_nota_credito), 0::numeric)) as promedio_documento
 from public.purchase_history h group by h.company_id, h.rut;
