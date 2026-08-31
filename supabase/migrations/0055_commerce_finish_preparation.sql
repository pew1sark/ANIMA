-- 0055 · COMMERCE · cierre de preparacion
-- La funcion mas larga del sistema: descuenta de los lotes reservados,
-- calcula el costo real por linea, registra la diferencia de peso y avisa.
-- Portada con verificacion de empresa y ajustes leidos de company_config.
create or replace function public.finish_preparation(_order_id uuid, _items jsonb,
  _register_diff_as_loss boolean default true)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  o record; e jsonb; it record; v_qty numeric; v_remaining numeric; v_take numeric;
  r record; v_cost_sum numeric; v_qty_sum numeric; v_lot_cost numeric; v_diff numeric;
  v_tol numeric; v_alertas jsonb := '[]'::jsonb; v_name text; v_desc_hielo boolean;
  v_gross numeric; v_ice numeric;
begin
  select * into o from public.orders where id = _order_id for update;
  if o is null then raise exception 'Pedido no encontrado'; end if;
  perform public.assert_company(o.company_id, 40);
  perform public.guard_orders_update();
  if o.status not in ('en_preparacion','confirmado') then
    raise exception 'El pedido no esta en preparacion';
  end if;

  v_tol        := coalesce(public.company_setting(o.company_id,'operacion','tolerancia_peso_pct')::numeric, 5);
  v_desc_hielo := coalesce(public.company_setting(o.company_id,'operacion','descontar_hielo_del_peso')::boolean, true);

  for e in select * from jsonb_array_elements(_items) loop
    select * into it from public.order_items
     where id = (e->>'item_id')::uuid and order_id = _order_id and company_id = o.company_id;
    continue when it is null;

    v_gross := nullif(e->>'gross_weight','')::numeric;
    v_ice   := coalesce(nullif(e->>'ice_weight','')::numeric, 0);
    v_qty   := coalesce(nullif(e->>'quantity_prepared','')::numeric,
                 case when v_gross is not null and v_desc_hielo then v_gross - v_ice else v_gross end);
    if v_qty is null or v_qty <= 0 then continue; end if;

    v_remaining := v_qty; v_cost_sum := 0; v_qty_sum := 0;

    for r in select * from public.stock_reservations
             where order_item_id = it.id and company_id = o.company_id and status = 'activa'
             order by created_at loop
      exit when v_remaining <= 0;
      v_take := least(v_remaining, r.quantity - r.consumed);
      update public.inventory_lots
         set quantity_on_hand  = greatest(quantity_on_hand - v_take, 0),
             quantity_reserved = greatest(quantity_reserved - v_take, 0)
       where id = r.lot_id;
      select unit_cost into v_lot_cost from public.inventory_lots where id = r.lot_id;
      insert into public.inventory_movements (company_id, product_id, lot_id, type, quantity, unit,
             unit_cost, reference_type, reference_id, reference_code, reason, created_by)
      values (o.company_id, it.product_id, r.lot_id, 'salida_venta', v_take, it.unit, v_lot_cost,
              'order', _order_id::text, o.code, 'Preparacion de pedido', (select auth.uid()));
      v_cost_sum := v_cost_sum + (v_take * coalesce(v_lot_cost, 0));
      v_qty_sum  := v_qty_sum + v_take;
      update public.stock_reservations
         set consumed = consumed + v_take,
             status = case when (consumed + v_take) >= quantity then 'consumida' else 'activa' end
       where id = r.id;
      v_remaining := v_remaining - v_take;
    end loop;

    -- Libera lo que quedo reservado y no se uso
    for r in select * from public.stock_reservations
             where order_item_id = it.id and company_id = o.company_id and status = 'activa' loop
      update public.inventory_lots
         set quantity_reserved = greatest(quantity_reserved - (r.quantity - r.consumed), 0)
       where id = r.lot_id;
      update public.stock_reservations set status = 'liberada' where id = r.id;
    end loop;

    update public.order_items
       set quantity_prepared = v_qty, gross_weight = v_gross, ice_weight = v_ice,
           unit_cost = case when v_qty_sum > 0 then round(v_cost_sum / v_qty_sum, 2) else unit_cost end
     where id = it.id;

    v_diff := abs(v_qty - it.quantity_ordered) / nullif(it.quantity_ordered, 0) * 100;
    if v_diff > v_tol then
      select name into v_name from public.products where id = it.product_id;
      v_alertas := v_alertas || jsonb_build_object('producto', v_name,
                    'pedido', it.quantity_ordered, 'preparado', v_qty, 'diferencia_pct', round(v_diff, 1));
    end if;

    perform public.check_low_stock(it.product_id);
  end loop;

  perform public.recalc_order_totals(_order_id);
  update public.orders
     set status = 'preparado', prepared_at = now(),
         prepared_by = coalesce(prepared_by, (select auth.uid()))
   where id = _order_id;

  if jsonb_array_length(v_alertas) > 0 then
    insert into public.notifications (company_id, target_role, title, body, kind, link)
    values (o.company_id, 'admin', 'Diferencia de peso sobre ' || v_tol || '% · ' || o.code,
            'Hay que avisar al cliente antes de despachar.', 'warning', '/pedidos/' || o.id::text);
  end if;

  insert into public.notifications (company_id, target_role, title, body, kind, link)
  values (o.company_id, 'reparto', 'Pedido listo para reparto ' || o.code,
          'Preparado y disponible para carga.', 'success', '/t/ruta');

  return jsonb_build_object('ok', true, 'alertas', v_alertas);
end $$;
revoke execute on function public.finish_preparation(uuid,jsonb,boolean) from public, anon;
grant  execute on function public.finish_preparation(uuid,jsonb,boolean) to authenticated;

-- Ajustes operativos por defecto para las empresas existentes
insert into public.company_config (company_id, key, value, description)
select id, 'operacion',
  jsonb_build_object('tolerancia_peso_pct', 5,
                     'descontar_hielo_del_peso', true,
                     'permitir_venta_sin_stock', false),
  'Reglas de preparacion y despacho'
from public.companies
on conflict (company_id, key) do nothing;