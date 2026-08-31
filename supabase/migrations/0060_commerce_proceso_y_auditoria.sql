-- 0060 · COMMERCE · proceso de lotes, pesos de entrega y auditoria generica
-- process_lot es el motor de transformacion: entra un lote entero, salen
-- filetes con su costo prorrateado por valor de venta. Bilagay lo usa.
-- audit_row se adapta a la forma de audit_logs de la plataforma, que lleva
-- company_id y guarda el antes/despues en metadata.

create or replace function public.process_lot(_source_lot_id uuid, _input_quantity numeric,
  _outputs jsonb, _notes text default null, _location_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare l record; e jsonb; v_proc uuid; v_out_total numeric := 0; v_value_total numeric := 0;
        v_input_cost numeric; v_waste numeric; v_lot uuid; v_qty numeric; v_prod uuid;
        v_price numeric; v_share numeric; v_unit_cost numeric; v_yield numeric;
begin
  select * into l from public.inventory_lots where id = _source_lot_id for update;
  if l is null then raise exception 'Lote no encontrado'; end if;
  perform public.assert_company(l.company_id, 40);
  if not (public.has_perm('inventory','update') or public.has_perm('lots','create')) then
    raise exception 'Sin permiso para procesar producto';
  end if;
  if _input_quantity > l.quantity_available then
    raise exception 'El lote solo tiene % disponible (hay % reservado)', l.quantity_available, l.quantity_reserved;
  end if;

  for e in select * from jsonb_array_elements(_outputs) loop
    v_qty  := (e->>'quantity')::numeric;
    v_prod := (e->>'product_id')::uuid;
    select sale_price into v_price from public.products
     where id = v_prod and company_id = l.company_id;
    if v_price is null then raise exception 'Producto de salida no encontrado en esta empresa'; end if;
    v_out_total   := v_out_total + v_qty;
    v_value_total := v_value_total + v_qty * coalesce(nullif(v_price, 0), 1);
  end loop;

  if v_out_total <= 0 then raise exception 'Debes registrar al menos un producto de salida'; end if;
  if v_out_total > _input_quantity then
    raise exception 'La salida (%) no puede superar la entrada (%)', v_out_total, _input_quantity;
  end if;

  v_input_cost := round(_input_quantity * l.unit_cost, 2);
  v_waste := _input_quantity - v_out_total;
  v_yield := round((v_out_total / _input_quantity) * 100, 2);

  insert into public.processing_orders (company_id, source_lot_id, source_product_id, input_quantity,
         output_quantity, waste_quantity, yield_pct, input_cost, location_id, notes, processed_by)
  values (l.company_id, _source_lot_id, l.product_id, _input_quantity, v_out_total, v_waste,
          v_yield, v_input_cost, coalesce(_location_id, l.location_id), _notes, (select auth.uid()))
  returning id into v_proc;

  update public.inventory_lots
     set quantity_on_hand = quantity_on_hand - _input_quantity,
         status = case when (quantity_on_hand - _input_quantity) <= 0 then 'agotado' else status end
   where id = _source_lot_id;

  insert into public.inventory_movements (company_id, product_id, lot_id, type, quantity, unit, unit_cost,
         reference_type, reference_id, reason, created_by)
  values (l.company_id, l.product_id, _source_lot_id, 'proceso_consumo', _input_quantity, l.unit, l.unit_cost,
          'processing', v_proc::text, coalesce(_notes,'Proceso de producto'), (select auth.uid()));

  for e in select * from jsonb_array_elements(_outputs) loop
    v_qty  := (e->>'quantity')::numeric;
    v_prod := (e->>'product_id')::uuid;
    select sale_price into v_price from public.products where id = v_prod;
    -- El costo de entrada se reparte segun el valor de venta de cada salida
    v_share     := (v_qty * coalesce(nullif(v_price, 0), 1)) / nullif(v_value_total, 0);
    v_unit_cost := round((v_input_cost * v_share) / v_qty, 2);

    insert into public.inventory_lots (company_id, product_id, supplier_id, received_at, expires_at,
           initial_quantity, quantity_on_hand, unit, unit_cost, origin, location_id, status, received_by, notes)
    values (l.company_id, v_prod, l.supplier_id, now(), l.expires_at, v_qty, v_qty,
            l.unit, v_unit_cost, coalesce(l.origin, 'Proceso interno'),
            coalesce(_location_id, l.location_id), 'disponible', (select auth.uid()),
            'Procesado desde ' || l.code)
    returning id into v_lot;

    insert into public.processing_outputs (company_id, processing_id, product_id, lot_id, quantity, unit_cost)
    values (l.company_id, v_proc, v_prod, v_lot, v_qty, v_unit_cost);

    insert into public.inventory_movements (company_id, product_id, lot_id, type, quantity, unit, unit_cost,
           reference_type, reference_id, reason, created_by)
    values (l.company_id, v_prod, v_lot, 'proceso_produccion', v_qty, l.unit, v_unit_cost,
            'processing', v_proc::text, 'Producido desde ' || l.code, (select auth.uid()));

    update public.products
       set last_cost = v_unit_cost,
           avg_cost = case when avg_cost = 0 then v_unit_cost else round((avg_cost + v_unit_cost)/2, 2) end
     where id = v_prod;

    insert into public.processing_yields (company_id, source_product_id, output_product_id,
           samples, avg_yield_pct, last_yield_pct)
    values (l.company_id, l.product_id, v_prod, 1,
            round((v_qty / _input_quantity) * 100, 2), round((v_qty / _input_quantity) * 100, 2))
    on conflict (source_product_id, output_product_id) do update
      set samples = public.processing_yields.samples + 1,
          avg_yield_pct = round(((public.processing_yields.avg_yield_pct * public.processing_yields.samples)
                                 + excluded.last_yield_pct) / (public.processing_yields.samples + 1), 2),
          last_yield_pct = excluded.last_yield_pct, updated_at = now();

    perform public.check_low_stock(v_prod);
  end loop;

  -- Desecho: costo 0, ya esta absorbido en el costo del producto de salida
  if v_waste > 0 then
    insert into public.losses (company_id, product_id, lot_id, quantity, unit, reason, cost, notes, created_by)
    values (l.company_id, l.product_id, _source_lot_id, v_waste, l.unit, 'merma_proceso', 0,
            'Desecho de fileteo (costo absorbido en el producto procesado)', (select auth.uid()));
  end if;

  perform public.check_low_stock(l.product_id);
  return jsonb_build_object('ok', true, 'processing_id', v_proc, 'rendimiento_pct', v_yield,
                            'merma', v_waste, 'costo_entrada', v_input_cost);
end $$;

create or replace function public.update_delivery_weights(_delivery_id uuid, _items jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare d record; e jsonb; it record; v_qty numeric; v_delta numeric; v_lot uuid;
begin
  select * into d from public.deliveries where id = _delivery_id for update;
  if d is null then raise exception 'Entrega no encontrada'; end if;
  perform public.assert_company(d.company_id, 40);
  if not (public.is_admin() or d.driver_id = (select auth.uid()) or public.has_perm('deliveries','update')) then
    raise exception 'Sin permiso sobre esta entrega';
  end if;
  if d.status = 'entregada' then raise exception 'La entrega ya fue cerrada'; end if;

  for e in select * from jsonb_array_elements(_items) loop
    select * into it from public.order_items
     where id = (e->>'item_id')::uuid and order_id = d.order_id and company_id = d.company_id;
    continue when it is null;
    v_qty := (e->>'quantity')::numeric;
    v_delta := v_qty - coalesce(it.quantity_prepared, it.quantity_ordered);
    if v_delta = 0 then continue; end if;

    -- Devuelve al lote lo que el cliente no recibio; si pidio mas, sale del mismo lote
    select lot_id into v_lot from public.order_items where id = it.id;
    if v_lot is not null then
      update public.inventory_lots set quantity_on_hand = greatest(quantity_on_hand - v_delta, 0) where id = v_lot;
    end if;

    insert into public.inventory_movements (company_id, product_id, lot_id, type, quantity, unit, unit_cost,
           reference_type, reference_id, reason, created_by)
    values (d.company_id, it.product_id, v_lot,
            case when v_delta > 0 then 'salida_venta' else 'devolucion' end,
            abs(v_delta), it.unit, it.unit_cost, 'delivery', _delivery_id::text,
            'Ajuste de peso en la entrega', (select auth.uid()));

    update public.order_items set quantity_prepared = v_qty where id = it.id;
    perform public.check_low_stock(it.product_id);
  end loop;

  perform public.recalc_order_totals(d.order_id);
  return jsonb_build_object('ok', true);
end $$;

-- Bitacora de precios de venta
create or replace function public.trg_price_history()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and new.sale_price is distinct from old.sale_price then
    insert into public.product_price_history (company_id, product_id, price, previous_price,
           cost_reference, changed_by)
    values (new.company_id, new.id, new.sale_price, old.sale_price, new.avg_cost, (select auth.uid()));
  end if;
  return new;
end $$;
revoke execute on function public.trg_price_history() from public, anon, authenticated;
drop trigger if exists products_price_history on public.products;
create trigger products_price_history after update on public.products
  for each row execute function public.trg_price_history();

-- Auditoria generica: se adapta a la forma de audit_logs de la plataforma.
create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_before jsonb; v_after jsonb; v_fila jsonb; v_id text; v_company uuid;
begin
  if tg_op = 'DELETE' then
    v_before := to_jsonb(old); v_after := null; v_fila := v_before;
  elsif tg_op = 'UPDATE' then
    v_before := to_jsonb(old); v_after := to_jsonb(new); v_fila := v_after;
    if v_before = v_after then return new; end if;
  else
    v_before := null; v_after := to_jsonb(new); v_fila := v_after;
  end if;

  v_id      := coalesce(v_fila->>'id', v_fila->>'key', v_fila->>'code', v_fila->>'token');
  v_company := nullif(v_fila->>'company_id','')::uuid;

  insert into public.audit_logs (company_id, user_id, action, entity, entity_id, metadata)
  values (v_company, (select auth.uid()), tg_op, tg_table_name, v_id,
    jsonb_strip_nulls(jsonb_build_object(
      'antes', v_before, 'despues', v_after,
      'cambios', case when tg_op = 'UPDATE' then (
        select jsonb_object_agg(k, jsonb_build_object('antes', v_before->k, 'despues', v_after->k))
        from jsonb_object_keys(v_after) k
        where v_before->k is distinct from v_after->k and k not in ('updated_at')
      ) end)));
  return coalesce(new, old);
end $$;
revoke execute on function public.audit_row() from public, anon, authenticated;

revoke execute on function public.process_lot(uuid,numeric,jsonb,text,uuid) from public, anon;
grant  execute on function public.process_lot(uuid,numeric,jsonb,text,uuid) to authenticated;
revoke execute on function public.update_delivery_weights(uuid,jsonb) from public, anon;
grant  execute on function public.update_delivery_weights(uuid,jsonb) to authenticated;