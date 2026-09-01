-- 0080b — Acentos en los tramos de cobranza
--
-- Al aplicar la 0080 volví a escribir sin acentos los nombres de los tramos
-- ("1 a 30 dias"), que son texto que lee una persona en el informe. Igual que
-- en la 0078b: la precaución con la codificación no era precaución, era una
-- regresión. Esta migración deja la función como está en el archivo 0080.
--
-- Nota para la próxima: la codificación funciona. Escribir el SQL con acentos
-- es correcto y no hay que "protegerlo".

begin;
create or replace function public.informe_ventas(
  p_company uuid,
  p_desde   date default (current_date - 180),
  p_hasta   date default current_date
) returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
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

      /* La antigüedad de la deuda: no es lo mismo deber hace tres días que
         hace tres meses, y el total solo no lo dice. */
      'cobranza', (
        select coalesce(jsonb_agg(t order by t->>'orden'), '[]'::jsonb) from (
          select jsonb_build_object(
                   'orden', tramo.orden,
                   'tramo', tramo.nombre,
                   'monto', coalesce(sum(o.total - o.amount_paid), 0),
                   'documentos', count(o.id)) as t
            from (values (1, 'Por vencer',   -100000, 0),
                         (2, '1 a 30 días',       0, 30),
                         (3, '31 a 60 días',     30, 60),
                         (4, '61 a 90 días',     60, 90),
                         (5, 'Más de 90 días',   90, 100000)) as tramo(orden, nombre, desde, hasta)
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
$fn$;

comment on function public.informe_ventas(uuid, date, date) is
  'Ventas, margen, top clientes y productos, antigüedad de la deuda e inventario.';

commit;
