-- ===========================================================
-- 0127 · Una venta cerrada es un pedido
-- -----------------------------------------------------------
-- El inventario del módulo inmobiliario guarda qué se vendió, cuándo
-- y a qué precio, pero eso vive en `rei_properties` y el módulo de
-- Ventas de la misma empresa no lo ve. Esta migración lo convierte:
-- cada inmueble vendido se vuelve un pedido cerrado.
--
-- Hay UNA decisión aquí que decide si las cifras del módulo Ventas
-- significan algo o son un adorno caro, y conviene dejarla escrita.
--
-- ---------- EL TOTAL DEL PEDIDO ES LA COMISIÓN ----------
--
-- La tentación es poner el precio del inmueble. No: la firma
-- intermedia, no compra ni vende por cuenta propia. De una venta de
-- 100 millones la empresa recibe su comisión —el supuesto
-- `comision_intermediacion`, 3% donde no se haya cambiado—, no los
-- 100 millones.
--
-- Poner el precio del inmueble en `orders.total` haría que «Ventas 30
-- días», el ticket promedio y el panel de Inicio mostraran un dinero
-- que nunca entró a la empresa, en los mismos lugares donde alguien
-- lee cuánto factura. Multiplicar por treinta lo que se ingresa no es
-- un detalle de modelado: es la clase de cifra que después se lleva a
-- una reunión.
--
-- El precio del inmueble no se pierde: va en `custom` del pedido,
-- junto al código y la tipología, y el inmueble queda enlazado por
-- `rei_properties.order_id`.
--
-- ---------- QUIÉN ES EL CLIENTE ----------
--
-- El PROPIETARIO, no el comprador. No es una aproximación: la planilla
-- de origen no registra quién compró —no tiene esa columna— y quien
-- encarga el servicio de intermediación es el dueño que entrega el
-- inmueble. Inventar un comprador para llenar la casilla habría sido
-- fabricar una contraparte.
--
-- ---------- QUÉ SE QUEDA FUERA ----------
--
-- Los vendidos SIN fecha de venta. `orders.order_date` no admite
-- nulos, y ponerles la fecha de ingreso —que es cuando se captó, no
-- cuando se vendió— o la de hoy metería en la serie mensual una venta
-- en un mes en que no ocurrió. El panel ya avisa cuántos son; se
-- convierten solos en cuanto alguien complete la fecha y se vuelva a
-- correr esto.
--
-- Idempotente: un inmueble ya convertido no se vuelve a mirar.
-- ===========================================================

alter table public.rei_properties
  add column if not exists order_id uuid references public.orders(id) on delete set null;

create index if not exists rei_properties_order
  on public.rei_properties(order_id) where order_id is not null;

comment on column public.rei_properties.order_id is
  'El pedido de Ventas que registra esta venta cerrada. Lo llena rei_sincronizar_ventas().';

-- ---------- LA SINCRONIZACIÓN ----------
-- Nivel 60, igual que la del CRM y por lo mismo: emitir documentos de
-- venta en nombre de la empresa es administrativo, no operativo.
create or replace function public.rei_sincronizar_ventas(p_company uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_producto uuid; v_pct numeric; v_nuevos int := 0;
  v_sin_fecha int; v_sin_dueno int; v_sin_precio int;
begin
  if not public.has_company_level(p_company, 60) then
    raise exception 'No tienes permiso para sincronizar las ventas de esta empresa';
  end if;

  -- Sin la tarifa no hay pedido que emitir. Caer a un 3% escrito aquí
  -- adentro habría puesto una cifra de plata a depender de una
  -- constante que nadie sabe que existe.
  v_pct := public.rei_parametro(p_company, 'comision_intermediacion');
  if v_pct is null then
    raise exception 'Falta el supuesto «comision_intermediacion». Cárgalo en Supuestos antes de convertir las ventas.';
  end if;

  -- El servicio que se vende. Uno solo, y se reconoce por su SKU: un
  -- inmueble no es un producto de catálogo —no se repone ni tiene
  -- stock— pero la intermediación sí es lo mismo cada vez.
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

  -- Un pedido por inmueble vendido. `order_items_totals` recalcula el
  -- subtotal y el total del padre al insertar la línea, así que aquí
  -- no se escriben: dejarlos a mano habría creado una segunda verdad
  -- que puede empezar a diferir de la suma de sus líneas.
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
           -- Una venta cerrada hace años se registra saldada. Dejarla
           -- pendiente habría inventado una cuenta por cobrar que
           -- nadie está cobrando, y eso ensucia Finanzas, que es
           -- justo donde se mira qué falta entrar.
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
    returning id, (custom->>'inmueble') as inmueble, total
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

  -- Lo que quedó fuera, y por qué. Un conteo sin motivo obliga a ir a
  -- buscarlo a mano.
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
end $$;
comment on function public.rei_sincronizar_ventas(uuid) is
  'Convierte cada inmueble vendido en un pedido cerrado del módulo Ventas. El total del pedido es la COMISIÓN, no el precio del inmueble. Idempotente.';
revoke execute on function public.rei_sincronizar_ventas(uuid) from public, anon;
grant  execute on function public.rei_sincronizar_ventas(uuid) to authenticated;
