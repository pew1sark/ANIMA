-- 0056 · COMMERCE · compras
-- Correcciones al portar:
--   · resolve_supplier buscaba alias y proveedores SIN filtrar empresa:
--     el texto de una empresa resolvia al proveedor de otra.
--   · audit_logs de JLIZ tiene otra forma (user_email, table_name, record_id,
--     after, reason). Se mapea a la de la plataforma, que lleva company_id.
--   · verificacion de empresa en todas.

create or replace function public.resolve_supplier(_texto text)
returns uuid language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_t text := lower(trim(coalesce(_texto, ''))); v_company uuid;
begin
  if v_t = '' then return null; end if;
  v_company := public.current_company();
  if v_company is null then return null; end if;

  select supplier_id into v_id from public.supplier_aliases
   where company_id = v_company and lower(alias) = v_t;
  if v_id is not null then return v_id; end if;

  select id into v_id from public.suppliers
   where company_id = v_company and lower(trim(name)) = v_t limit 1;
  if v_id is not null then return v_id; end if;

  select id into v_id from public.suppliers
   where company_id = v_company
     and (lower(name) like '%'||v_t||'%' or lower(coalesce(company,'')) like '%'||v_t||'%')
   order by length(name) limit 1;
  return v_id;
end $$;

create or replace function public.receive_purchase(_purchase_id uuid, _notes text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare p record; it record; v_lot_id uuid; v_extra numeric; v_ratio numeric;
        v_unit_cost numeric; v_lots int := 0; v_qty_total numeric;
begin
  select * into p from public.purchases where id = _purchase_id for update;
  if p is null then raise exception 'Compra no encontrada'; end if;
  perform public.assert_company(p.company_id, 60);
  if not (public.has_perm('purchases','update') or public.has_perm('lots','create')) then
    raise exception 'No tienes permiso para recibir compras';
  end if;
  if p.status = 'recibida' then raise exception 'La compra ya fue recibida'; end if;
  if p.status = 'anulada'  then raise exception 'La compra esta anulada'; end if;

  perform public.recalc_purchase_totals(_purchase_id);
  select * into p from public.purchases where id = _purchase_id;

  v_extra := coalesce(p.freight_cost,0) + coalesce(p.other_costs,0);
  select coalesce(sum(line_total),0) into v_qty_total
    from public.purchase_items where purchase_id = _purchase_id;

  for it in select * from public.purchase_items
            where purchase_id = _purchase_id and company_id = p.company_id loop
    -- prorrateo de flete y costos adicionales segun participacion en el subtotal
    v_ratio := case when v_qty_total > 0 then it.line_total / v_qty_total else 0 end;
    v_unit_cost := round(it.unit_price +
                   case when it.quantity > 0 then (v_extra * v_ratio) / it.quantity else 0 end, 2);

    insert into public.inventory_lots (company_id, product_id, supplier_id, purchase_id, purchase_item_id,
           received_at, initial_quantity, quantity_on_hand, unit, unit_cost, origin, status, received_by, notes)
    values (p.company_id, it.product_id, p.supplier_id, p.id, it.id, now(),
            it.quantity, it.quantity, it.unit, v_unit_cost, p.origin, 'disponible',
            (select auth.uid()), it.notes)
    returning id into v_lot_id;

    insert into public.inventory_movements (company_id, product_id, lot_id, type, quantity, unit, unit_cost,
           reference_type, reference_id, reference_code, reason, created_by)
    values (p.company_id, it.product_id, v_lot_id, 'entrada_compra', it.quantity, it.unit, v_unit_cost,
            'purchase', p.id::text, p.code, 'Recepcion de compra', (select auth.uid()));

    update public.products
       set last_cost = v_unit_cost,
           avg_cost = case when avg_cost = 0 then v_unit_cost else round((avg_cost + v_unit_cost)/2, 2) end
     where id = it.product_id;

    insert into public.supplier_products (company_id, supplier_id, product_id, last_price, avg_price, last_purchase_at)
    values (p.company_id, p.supplier_id, it.product_id, it.unit_price, it.unit_price, now())
    on conflict (supplier_id, product_id) do update
      set last_price = excluded.last_price,
          avg_price = round((coalesce(public.supplier_products.avg_price, excluded.last_price) + excluded.last_price)/2, 2),
          last_purchase_at = excluded.last_purchase_at;

    v_lots := v_lots + 1;
  end loop;

  update public.purchases
     set status = 'recibida', received_by = (select auth.uid()), notes = coalesce(_notes, notes)
   where id = _purchase_id;

  insert into public.notifications (company_id, target_role, title, body, kind, link)
  values (p.company_id, 'admin', 'Compra recibida ' || p.code,
          v_lots || ' lote(s) ingresados a inventario.', 'success', '/compras/' || p.id::text);

  return jsonb_build_object('ok', true, 'lots_created', v_lots, 'purchase_code', p.code);
end $$;

create or replace function public.update_purchase_costs(_purchase_id uuid, _freight numeric default null,
  _other numeric default null, _invoice text default null, _notes text default null,
  _due_date date default null, _payment_method public.payment_method default null,
  _purchase_date date default null, _origin text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare p record; it record; v_extra numeric; v_ratio numeric; v_costo numeric;
        v_ajustados int := 0; v_con_movimiento int := 0; v_lote record;
begin
  select * into p from public.purchases where id = _purchase_id for update;
  if p is null then raise exception 'Compra no encontrada'; end if;
  perform public.assert_company(p.company_id, 60);
  if not public.has_perm('purchases','update') then raise exception 'Sin permiso para editar compras'; end if;
  if p.status = 'anulada' then raise exception 'La compra esta anulada'; end if;

  update public.purchases
     set freight_cost   = coalesce(_freight, freight_cost),
         other_costs    = coalesce(_other, other_costs),
         invoice_number = coalesce(nullif(trim(_invoice), ''), invoice_number),
         notes          = coalesce(nullif(trim(_notes), ''), notes),
         due_date       = coalesce(_due_date, due_date),
         payment_method = coalesce(_payment_method, payment_method),
         purchase_date  = coalesce(_purchase_date, purchase_date),
         origin         = coalesce(nullif(trim(_origin), ''), origin)
   where id = _purchase_id;

  perform public.recalc_purchase_totals(_purchase_id);
  select * into p from public.purchases where id = _purchase_id;

  -- En una compra ya recibida hay que rehacer el costo por kilo de sus lotes
  if p.status = 'recibida' then
    v_extra := coalesce(p.freight_cost, 0) + coalesce(p.other_costs, 0);
    for it in select * from public.purchase_items where purchase_id = _purchase_id loop
      v_ratio := case when p.subtotal > 0 then it.line_total / p.subtotal else 0 end;
      v_costo := round(it.unit_price +
                 case when it.quantity > 0 then (v_extra * v_ratio) / it.quantity else 0 end, 2);
      for v_lote in select * from public.inventory_lots where purchase_item_id = it.id loop
        if v_lote.quantity_on_hand < v_lote.initial_quantity then
          -- Ya salio producto de este lote: el costo viejo quedo en ventas pasadas
          v_con_movimiento := v_con_movimiento + 1;
        end if;
        update public.inventory_lots set unit_cost = v_costo where id = v_lote.id;
        update public.products
           set last_cost = v_costo,
               avg_cost = case when avg_cost = 0 then v_costo else round((avg_cost + v_costo)/2, 2) end
         where id = it.product_id;
        v_ajustados := v_ajustados + 1;
      end loop;
    end loop;
  end if;

  insert into public.audit_logs (company_id, user_id, action, entity, entity_id, metadata)
  values (p.company_id, (select auth.uid()), 'EDITAR_COMPRA', 'purchases', _purchase_id::text,
          jsonb_build_object('flete', p.freight_cost, 'otros', p.other_costs, 'total', p.total,
                             'motivo', 'Correccion de una compra ya ingresada'));

  return jsonb_build_object('ok', true, 'total', p.total,
    'lotes_ajustados', v_ajustados, 'lotes_con_movimiento', v_con_movimiento,
    'costo_por_kilo', case when p.subtotal > 0
      then round(p.total / nullif((select sum(quantity) from public.purchase_items where purchase_id = _purchase_id), 0), 2)
      else 0 end);
end $$;

create or replace function public.void_purchase(_purchase_id uuid, _reason text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare p record; l record; v_company uuid; v_consumidos int; v_lotes int := 0;
begin
  select company_id into v_company from public.purchases where id = _purchase_id;
  perform public.assert_company(v_company, 60);
  if not (public.is_admin() or public.has_perm('purchases','update')) then
    raise exception 'Sin permiso para anular compras';
  end if;
  if coalesce(trim(_reason), '') = '' then raise exception 'Debes indicar el motivo de la anulacion'; end if;

  select * into p from public.purchases where id = _purchase_id for update;
  if p is null then raise exception 'Compra no encontrada'; end if;
  if p.status = 'anulada' then raise exception 'La compra ya esta anulada'; end if;
  if p.amount_paid > 0 then
    raise exception 'Esta compra tiene pagos registrados: primero hay que revertirlos';
  end if;

  select count(*) into v_consumidos
    from public.inventory_lots l
    join public.purchase_items i on i.id = l.purchase_item_id
   where i.purchase_id = _purchase_id
     and (l.quantity_on_hand < l.initial_quantity or l.quantity_reserved > 0);
  if v_consumidos > 0 then
    raise exception 'No se puede anular: % lote(s) ya se vendieron, reservaron o procesaron. Corrige con un ajuste de inventario.', v_consumidos;
  end if;

  for l in select l.* from public.inventory_lots l
           join public.purchase_items i on i.id = l.purchase_item_id
          where i.purchase_id = _purchase_id loop
    insert into public.inventory_movements (company_id, product_id, lot_id, type, quantity, unit, unit_cost,
           reference_type, reference_id, reason, created_by)
    values (v_company, l.product_id, l.id, 'ajuste_negativo', l.quantity_on_hand, l.unit, l.unit_cost,
            'purchase_void', _purchase_id::text, 'Anulacion de compra: ' || _reason, (select auth.uid()));
    update public.inventory_lots
       set quantity_on_hand = 0, status = 'agotado',
           notes = concat_ws(' · ', notes, 'Anulado: ' || _reason)
     where id = l.id;
    v_lotes := v_lotes + 1;
  end loop;

  update public.purchases
     set status = 'anulada', notes = concat_ws(' · ', notes, 'ANULADA: ' || _reason)
   where id = _purchase_id;

  insert into public.audit_logs (company_id, user_id, action, entity, entity_id, metadata)
  values (v_company, (select auth.uid()), 'ANULAR_COMPRA', 'purchases', _purchase_id::text,
          jsonb_build_object('motivo', _reason, 'lotes_revertidos', v_lotes));

  return jsonb_build_object('ok', true, 'lotes_revertidos', v_lotes);
end $$;

create or replace function public.register_supplier_payment(_purchase_id uuid, _amount numeric,
  _method public.payment_method default 'transferencia', _reference text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare p record;
begin
  select * into p from public.purchases where id = _purchase_id;
  if p is null then raise exception 'Compra no encontrada'; end if;
  perform public.assert_company(p.company_id, 60);
  if not (public.is_admin() or public.has_perm('payments','create')) then
    raise exception 'Sin permiso para registrar pagos';
  end if;
  if _amount <= 0 then raise exception 'El monto debe ser mayor a cero'; end if;

  insert into public.payments (company_id, direction, purchase_id, supplier_id, amount, method, reference, created_by)
  values (p.company_id, 'pago', _purchase_id, p.supplier_id, _amount, _method, _reference, (select auth.uid()));
  return jsonb_build_object('ok', true);
end $$;

do $$
declare f text;
begin
  foreach f in array array['resolve_supplier(text)','receive_purchase(uuid,text)',
    'void_purchase(uuid,text)',
    'update_purchase_costs(uuid,numeric,numeric,text,text,date,public.payment_method,date,text)',
    'register_supplier_payment(uuid,numeric,public.payment_method,text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;