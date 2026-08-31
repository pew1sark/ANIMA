-- 0053 · COMMERCE · ciclo de vida del pedido
-- Las funciones originales son SECURITY DEFINER: saltan el RLS. En un solo
-- inquilino daba igual; aqui cada una comprueba explicitamente la empresa de
-- la fila antes de tocarla. Sin eso, cancel_order(id_de_otra_empresa) pasaria.
--
-- Se corrige ademas fail_delivery, que en el original no verificaba nada.
-- Y settings pasa a company_config, que es por empresa.

create or replace function public.assert_company(p_company uuid, p_level int)
returns void language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_company is null then raise exception 'Registro sin empresa'; end if;
  if not public.has_company_level(p_company, p_level) then
    raise exception 'Sin acceso a los datos de esa empresa';
  end if;
end $$;
revoke execute on function public.assert_company(uuid,int) from public, anon;
grant  execute on function public.assert_company(uuid,int) to authenticated;

-- Lee un ajuste operativo de la empresa, con valor por defecto.
create or replace function public.company_setting(p_company uuid, p_key text, p_field text)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select value->>p_field from public.company_config
  where company_id = p_company and key = p_key;
$$;
revoke execute on function public.company_setting(uuid,text,text) from public, anon;
grant  execute on function public.company_setting(uuid,text,text) to authenticated;

create or replace function public.confirm_order(_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare o record; res jsonb; v_permitir boolean;
begin
  select * into o from public.orders where id = _order_id for update;
  if o is null then raise exception 'Pedido no encontrado'; end if;
  perform public.assert_company(o.company_id, 40);
  if not public.has_perm('orders','update') then raise exception 'Sin permiso para confirmar pedidos'; end if;
  if o.status <> 'nuevo' then raise exception 'Solo se pueden confirmar pedidos en estado NUEVO'; end if;

  res := public.reserve_order_stock(_order_id);
  v_permitir := coalesce(public.company_setting(o.company_id,'operacion','permitir_venta_sin_stock')::boolean, false);

  if jsonb_array_length(res->'faltantes') > 0 and not v_permitir then
    perform public.release_order_stock(_order_id);
    raise exception 'No hay stock suficiente: %', (
      select string_agg((f->>'product') || ' faltan ' || (f->>'faltante') || ' kg', '; ')
      from jsonb_array_elements(res->'faltantes') f);
  end if;

  update public.orders set status = 'confirmado', confirmed_at = now() where id = _order_id;
  insert into public.notifications (company_id, target_role, title, body, kind, link)
  values (o.company_id, 'inventario', 'Pedido por preparar ' || o.code,
          'Confirmado y con stock reservado.', 'info', '/pedidos/' || o.id::text);
  return jsonb_build_object('ok', true, 'reserva', res);
end $$;

create or replace function public.cancel_order(_order_id uuid, _reason text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare o record;
begin
  select * into o from public.orders where id = _order_id for update;
  if o is null then raise exception 'Pedido no encontrado'; end if;
  perform public.assert_company(o.company_id, 40);
  if not public.has_perm('orders','update') then raise exception 'Sin permiso'; end if;
  if o.status = 'entregado' then raise exception 'No se puede cancelar un pedido entregado'; end if;
  perform public.release_order_stock(_order_id);
  update public.orders set status = 'cancelado', cancel_reason = _reason where id = _order_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.start_preparation(_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare o record;
begin
  select * into o from public.orders where id = _order_id for update;
  if o is null then raise exception 'Pedido no encontrado'; end if;
  perform public.assert_company(o.company_id, 40);
  if not public.has_perm('orders','update') then raise exception 'Sin permiso para preparar pedidos'; end if;
  if o.status <> 'confirmado' then raise exception 'El pedido debe estar CONFIRMADO'; end if;
  update public.orders set status = 'en_preparacion', prepared_by = (select auth.uid()) where id = _order_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.dispatch_order(_order_id uuid, _driver_id uuid, _route_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare o record; v_del uuid;
begin
  select * into o from public.orders where id = _order_id for update;
  if o is null then raise exception 'Pedido no encontrado'; end if;
  perform public.assert_company(o.company_id, 40);
  if not public.has_perm('orders','update') then raise exception 'Sin permiso para despachar pedidos'; end if;
  if o.status <> 'preparado' then raise exception 'El pedido debe estar PREPARADO'; end if;

  update public.orders set status = 'en_reparto', driver_id = _driver_id where id = _order_id;
  insert into public.deliveries (company_id, order_id, route_id, driver_id, status, scheduled_date, started_at)
  values (o.company_id, _order_id, _route_id, _driver_id, 'asignada', coalesce(o.delivery_date, current_date), now())
  returning id into v_del;

  if _driver_id is not null then
    insert into public.notifications (company_id, user_id, title, body, kind, link)
    values (o.company_id, _driver_id, 'Nueva entrega asignada ' || o.code, 'Revisa tu hoja de ruta.', 'info', '/t/ruta');
  end if;
  return jsonb_build_object('ok', true, 'delivery_id', v_del);
end $$;

create or replace function public.start_delivery(_delivery_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare d record;
begin
  select * into d from public.deliveries where id = _delivery_id for update;
  if d is null then raise exception 'Entrega no encontrada'; end if;
  perform public.assert_company(d.company_id, 40);
  if not (public.is_admin() or d.driver_id = (select auth.uid()) or public.has_perm('deliveries','update')) then
    raise exception 'Esta entrega no esta asignada a ti';
  end if;
  if d.status = 'entregada' then raise exception 'La entrega ya fue cerrada'; end if;
  update public.deliveries set status = 'en_camino', started_at = coalesce(started_at, now())
   where id = _delivery_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.complete_delivery(_delivery_id uuid, _received_by text default null,
  _notes text default null, _lat numeric default null, _lng numeric default null,
  _amount_collected numeric default 0, _method public.payment_method default null,
  _photo_url text default null, _signature_url text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare d record; o record;
begin
  select * into d from public.deliveries where id = _delivery_id for update;
  if d is null then raise exception 'Entrega no encontrada'; end if;
  perform public.assert_company(d.company_id, 40);
  if not (public.is_admin() or d.driver_id = (select auth.uid()) or public.has_perm('deliveries','update')) then
    raise exception 'Sin permiso sobre esta entrega';
  end if;
  select * into o from public.orders where id = d.order_id;

  update public.deliveries
     set status = 'entregada', delivered_at = now(), received_by_name = _received_by,
         latitude = _lat, longitude = _lng, notes = _notes,
         amount_collected = coalesce(_amount_collected,0), payment_method = _method,
         photo_url = _photo_url, signature_url = _signature_url
   where id = _delivery_id;
  update public.orders set status = 'entregado', delivered_at = now() where id = d.order_id;

  if coalesce(_amount_collected,0) > 0 then
    insert into public.payments (company_id, direction, order_id, customer_id, amount, method, reference, created_by)
    values (d.company_id, 'cobro', d.order_id, o.customer_id, _amount_collected,
            coalesce(_method,'efectivo'), 'Entrega ' || d.code, (select auth.uid()));
  end if;

  insert into public.notifications (company_id, target_role, title, body, kind, link)
  values (d.company_id, 'admin', 'Pedido entregado ' || o.code,
          coalesce(_received_by,'Sin receptor registrado'), 'success', '/pedidos/' || o.id::text);
  return jsonb_build_object('ok', true);
end $$;

-- El original no comprobaba NADA: cualquiera con sesion podia marcar
-- fallida la entrega de cualquier empresa.
create or replace function public.fail_delivery(_delivery_id uuid, _reason text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare d record;
begin
  select * into d from public.deliveries where id = _delivery_id for update;
  if d is null then raise exception 'Entrega no encontrada'; end if;
  perform public.assert_company(d.company_id, 40);
  if not (public.is_admin() or d.driver_id = (select auth.uid()) or public.has_perm('deliveries','update')) then
    raise exception 'Sin permiso sobre esta entrega';
  end if;
  update public.deliveries set status = 'fallida', failure_reason = _reason where id = _delivery_id;
  return jsonb_build_object('ok', true);
end $$;

do $$
declare f text;
begin
  foreach f in array array['confirm_order(uuid)','cancel_order(uuid,text)','start_preparation(uuid)',
    'dispatch_order(uuid,uuid,uuid)','start_delivery(uuid)','fail_delivery(uuid,text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke execute on function public.complete_delivery(uuid,text,text,numeric,numeric,numeric,public.payment_method,text,text) from public, anon;
grant  execute on function public.complete_delivery(uuid,text,text,numeric,numeric,numeric,public.payment_method,text,text) to authenticated;