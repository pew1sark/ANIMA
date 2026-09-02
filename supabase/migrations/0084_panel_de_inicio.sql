-- ===========================================================================
-- 0084 · El panel de inicio de ANIMA COMPANY
-- ===========================================================================
-- Hasta aquí, la pantalla de inicio mostraba ocho cifras sueltas de
-- `dashboard_kpis()`: cuánto hay, sin decir hacia dónde va. Nadie abre su
-- empresa por la mañana para leer un número; la abre para saber qué pasó ayer,
-- qué sale hoy y qué se está poniendo feo.
--
-- `panel_inicio()` responde eso en una sola llamada: el día, el mes contra el
-- mes anterior, la serie de los últimos treinta días, doce meses de historia,
-- los pedidos que vienen, el stock que se acaba, lo que vence en bodega, la
-- antigüedad de la deuda y el reparto geográfico de los clientes.
--
-- Se calcula aquí, como los informes y por la misma razón: para que no haya
-- dos respuestas a la misma pregunta según por dónde se mire. La pantalla
-- dibuja; no suma.
--
-- Solo lee. No crea ni cambia ninguna tabla.
-- ===========================================================================

create or replace function public.panel_inicio(p_company uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select case when not public.has_company_level(p_company, 40) then '{}'::jsonb else
    jsonb_build_object(

      -- ------------------------------------------------------------------ hoy
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

      -- ------------------------------------------------------------------ mes
      -- El mes corriente contra el mismo tramo del mes anterior. Comparar un
      -- día 4 contra un mes cerrado no dice nada: siempre parece un desastre.
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

      -- --------------------------------------------------------------- cobro
      'cobro', (
        select jsonb_build_object(
          'por_cobrar', coalesce(sum(o.total - o.amount_paid), 0),
          'vencido',    coalesce(sum(o.total - o.amount_paid) filter (where o.due_date < current_date), 0),
          'documentos', count(*),
          'vencidos',   count(*) filter (where o.due_date < current_date))
        from public.orders o
       where o.company_id = p_company and o.status <> 'cancelado'
         and o.payment_status <> 'pagado' and o.total > o.amount_paid),

      -- ------------------------------------------------- serie de 30 días
      -- Con generate_series para que los días sin ventas existan y valgan
      -- cero: si no, el gráfico une dos puntos lejanos con una recta que
      -- inventa una semana que nunca ocurrió.
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

      -- ------------------------------------------------- doce meses atrás
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

      -- ------------------------------------------------------------ pedidos
      -- Lo que está vivo, no lo último que se tecleó: primero lo que sale
      -- antes. Un pedido cerrado ya no pide atención.
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

      -- ------------------------------------------------------ stock crítico
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

      -- --------------------------------------------------- lo que se vence
      -- Un negocio de fresco no pierde plata por vender poco: la pierde por
      -- botar lo que compró bien.
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

      -- ------------------------------------------------------- la cobranza
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

      -- ------------------------------------------------------------- mapa
      -- Dónde está el negocio. La región y la comuna del cliente son texto
      -- libre: aquí se agrupan tal cual y es la pantalla la que los reconoce,
      -- que perdona mejor las tildes y las mayúsculas que un `=` de SQL.
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
$$;

comment on function public.panel_inicio(uuid) is
  'Todo lo que dibuja la pantalla de inicio de ANIMA COMPANY, en una llamada. Solo lectura; exige nivel 40 en la empresa.';

revoke all on function public.panel_inicio(uuid) from public, anon;
grant execute on function public.panel_inicio(uuid) to authenticated;
