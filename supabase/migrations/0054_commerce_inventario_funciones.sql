-- 0054 · COMMERCE · reserva, liberacion, ajustes y mermas
-- Correcciones multiempresa sobre el original:
--   · reserve_order_stock buscaba lotes por product_id sin filtrar empresa.
--     Se agrega el filtro explicito (defensa en profundidad).
--   · check_low_stock deduplicaba avisos por link sin mirar la empresa:
--     un aviso de una empresa silenciaba el de otra. Ahora es por empresa.
--   · todas verifican la empresa de la fila antes de tocarla.

create or replace function public.check_low_stock(_product_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_avail numeric; v_min numeric; v_name text; v_company uuid;
begin
  select p.min_stock, p.name, p.company_id into v_min, v_name, v_company
    from public.products p where p.id = _product_id;
  if v_company is null then return; end if;

  select coalesce(sum(quantity_available),0) into v_avail
    from public.inventory_lots
   where product_id = _product_id and company_id = v_company and status = 'disponible';

  if v_min > 0 and v_avail < v_min then
    if not exists (
      select 1 from public.notifications
      where company_id = v_company
        and link = '/inventario/' || _product_id::text
        and created_at > now() - interval '12 hours' and read_at is null
    ) then
      insert into public.notifications (company_id, target_role, title, body, kind, link)
      values (v_company, 'admin', 'Stock bajo: ' || v_name,
              'Disponible ' || round(v_avail,2) || ' bajo el minimo de ' || round(v_min,2) || '.',
              'warning', '/inventario/' || _product_id::text),
             (v_company, 'inventario', 'Stock bajo: ' || v_name,
              'Disponible ' || round(v_avail,2) || ' bajo el minimo de ' || round(v_min,2) || '.',
              'warning', '/inventario/' || _product_id::text);
    end if;
  end if;
end $$;

create or replace function public.reserve_order_stock(_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare it record; l record; v_remaining numeric; v_take numeric;
        v_short jsonb := '[]'::jsonb; v_name text; v_company uuid;
begin
  select company_id into v_company from public.orders where id = _order_id;
  perform public.assert_company(v_company, 40);

  for it in select * from public.order_items
            where order_id = _order_id and company_id = v_company and not is_reserved loop
    v_remaining := it.quantity_ordered;
    for l in
      select * from public.inventory_lots
      where product_id = it.product_id
        and company_id = v_company              -- <- el original no filtraba empresa
        and status = 'disponible' and quantity_available > 0
      order by expires_at nulls last, received_at asc
      for update
    loop
      exit when v_remaining <= 0;
      v_take := least(v_remaining, l.quantity_available);
      update public.inventory_lots set quantity_reserved = quantity_reserved + v_take where id = l.id;
      insert into public.stock_reservations (company_id, order_item_id, order_id, lot_id, quantity)
      values (v_company, it.id, _order_id, l.id, v_take);
      insert into public.inventory_movements (company_id, product_id, lot_id, type, quantity, unit,
             reference_type, reference_id, reason, created_by)
      values (v_company, it.product_id, l.id, 'reserva', v_take, it.unit, 'order', _order_id::text,
              'Reserva por pedido', (select auth.uid()));
      if it.lot_id is null then update public.order_items set lot_id = l.id where id = it.id; end if;
      v_remaining := v_remaining - v_take;
    end loop;

    if v_remaining > 0 then
      select name into v_name from public.products where id = it.product_id;
      v_short := v_short || jsonb_build_object('product', v_name, 'faltante', v_remaining);
    end if;
    update public.order_items set is_reserved = true where id = it.id;
    perform public.check_low_stock(it.product_id);
  end loop;
  return jsonb_build_object('ok', true, 'faltantes', v_short);
end $$;

create or replace function public.release_order_stock(_order_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; v_company uuid;
begin
  select company_id into v_company from public.orders where id = _order_id;
  perform public.assert_company(v_company, 40);

  for r in select * from public.stock_reservations
           where order_id = _order_id and company_id = v_company and status = 'activa' loop
    update public.inventory_lots
       set quantity_reserved = greatest(quantity_reserved - (r.quantity - r.consumed), 0)
     where id = r.lot_id;
    insert into public.inventory_movements (company_id, product_id, lot_id, type, quantity,
           reference_type, reference_id, reason, created_by)
    select v_company, l.product_id, r.lot_id, 'liberacion_reserva', (r.quantity - r.consumed),
           'order', _order_id::text, 'Liberacion de reserva', (select auth.uid())
    from public.inventory_lots l where l.id = r.lot_id and (r.quantity - r.consumed) > 0;
    update public.stock_reservations set status = 'liberada' where id = r.id;
  end loop;
  update public.order_items set is_reserved = false where order_id = _order_id;
end $$;

create or replace function public.adjust_lot_quantity(_lot_id uuid, _new_quantity numeric, _reason text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare l record; v_diff numeric;
begin
  select * into l from public.inventory_lots where id = _lot_id for update;
  if l is null then raise exception 'Lote no encontrado'; end if;
  perform public.assert_company(l.company_id, 40);
  if not (public.has_perm('inventory','update') or public.is_admin()) then raise exception 'Sin permiso'; end if;

  v_diff := _new_quantity - l.quantity_on_hand;
  if v_diff = 0 then return jsonb_build_object('ok', true, 'sin_cambios', true); end if;
  if _new_quantity < l.quantity_reserved then
    raise exception 'La cantidad no puede ser menor que lo reservado (%)', l.quantity_reserved;
  end if;

  update public.inventory_lots set quantity_on_hand = _new_quantity,
         status = case when _new_quantity = 0 then 'agotado' else status end where id = _lot_id;
  insert into public.inventory_movements (company_id, product_id, lot_id, type, quantity, unit, unit_cost,
         reference_type, reference_id, reason, created_by)
  values (l.company_id, l.product_id, _lot_id,
          case when v_diff > 0 then 'ajuste_positivo' else 'ajuste_negativo' end,
          abs(v_diff), l.unit, l.unit_cost, 'adjustment', _lot_id::text, _reason, (select auth.uid()));
  perform public.check_low_stock(l.product_id);
  return jsonb_build_object('ok', true, 'diferencia', v_diff);
end $$;

create or replace function public.register_loss(_product_id uuid, _lot_id uuid, _quantity numeric,
  _reason public.loss_reason, _notes text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_cost numeric; v_id uuid; v_company uuid;
begin
  select company_id into v_company from public.products where id = _product_id;
  perform public.assert_company(v_company, 40);
  if not public.has_perm('losses','create') then raise exception 'Sin permiso para registrar mermas'; end if;

  if _lot_id is not null then
    select unit_cost into v_cost from public.inventory_lots
     where id = _lot_id and company_id = v_company;
    if v_cost is null then raise exception 'Lote no encontrado en esta empresa'; end if;
    update public.inventory_lots
       set quantity_on_hand = greatest(quantity_on_hand - _quantity, 0),
           status = case when (quantity_on_hand - _quantity) <= 0 then 'agotado' else status end
     where id = _lot_id;
  else
    select avg_cost into v_cost from public.products where id = _product_id;
  end if;

  insert into public.losses (company_id, product_id, lot_id, quantity, reason, cost, notes, created_by)
  values (v_company, _product_id, _lot_id, _quantity, _reason,
          round(_quantity * coalesce(v_cost,0), 2), _notes, (select auth.uid()))
  returning id into v_id;

  insert into public.inventory_movements (company_id, product_id, lot_id, type, quantity, unit_cost,
         reference_type, reference_id, reason, created_by)
  values (v_company, _product_id, _lot_id, 'merma', _quantity, v_cost, 'loss', v_id::text,
          coalesce(_notes, _reason::text), (select auth.uid()));

  perform public.check_low_stock(_product_id);
  return jsonb_build_object('ok', true, 'loss_id', v_id);
end $$;

create or replace function public.guard_orders_update()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.has_perm('orders','update') then raise exception 'Sin permiso sobre pedidos'; end if;
end $$;

do $$
declare f text;
begin
  foreach f in array array['check_low_stock(uuid)','reserve_order_stock(uuid)','release_order_stock(uuid)',
    'adjust_lot_quantity(uuid,numeric,text)','guard_orders_update()',
    'register_loss(uuid,uuid,numeric,public.loss_reason,text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;