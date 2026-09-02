-- ===========================================================================
-- 0085 · El resumen de cada módulo
-- ===========================================================================
-- Un módulo que abre directo en una tabla de 400 filas no dice nada. Antes de
-- la lista hace falta la respuesta: cuántos hay, cuánto suman, quién se está
-- quedando atrás.
--
-- Se resuelve con UNA función y no con ocho, porque la respuesta viaja en una
-- forma genérica —cifras, series y listas— que la pantalla sabe dibujar sin
-- saber de qué módulo viene. Es el mismo trato que el motor de datos tiene con
-- las entidades: se declara qué hay, no se escribe una pantalla por cada cosa.
--
--   { "cifras": [ {etiqueta, valor, formato, nota, tono} ],
--     "series": [ {titulo, nota, formato, leyenda[], puntos:[{x,y,y2}]} ],
--     "listas": [ {titulo, nota, columnas:[{k,t,formato}], filas:[...]} ] }
--
-- `formato` dice cómo se escribe un número, no de qué color va: eso lo decide
-- `tono`, y solo cuando el valor significa algo bueno o malo.
--
-- Solo lee. No crea ni cambia ninguna tabla.
-- ===========================================================================

-- Una tarea abierta es la que no está hecha ni archivada. El estado es texto
-- libre heredado de STUDIO —«En proceso», «Archivada», a veces nulo—, así que
-- se compara sin mayúsculas y en un solo sitio: si mañana aparece «Completada»,
-- se agrega aquí y no en las cuatro consultas que preguntan lo mismo.
create or replace function public.tarea_abierta(p_estado text)
returns boolean
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  select lower(coalesce(p_estado, '')) not in ('hecha', 'archivada', 'completada', 'cerrada');
$$;

create or replace function public.resumen_modulo(p_company uuid, p_modulo text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  r jsonb;
begin
  if not public.has_company_level(p_company, 40) then
    return '{}'::jsonb;
  end if;

  case p_modulo

  -- ======================================================== CLIENTES (crm)
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

  -- ========================================================= VENTAS (commerce)
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

  -- =================================================== OPERACIONES (operations)
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

  -- ======================================================== REPARTO (delivery)
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

  -- ======================================================= FINANZAS (finance)
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
          /* El mes va en ISO y lo escribe la pantalla: `to_char` con TM depende
             del `lc_time` del servidor, y ahí no hay nadie que garantice que
             esté en español. */
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

  -- ======================================================== PROCESOS (food)
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

  -- ============================================================ AGENDA
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

  -- =========================================================== TALLER (creator)
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
$$;

comment on function public.resumen_modulo(uuid, text) is
  'Cifras, series y listas de un módulo, en una forma genérica que la pantalla dibuja sin saber de cuál viene. Solo lectura; exige nivel 40.';

revoke all on function public.resumen_modulo(uuid, text) from public, anon;
grant execute on function public.resumen_modulo(uuid, text) to authenticated;
