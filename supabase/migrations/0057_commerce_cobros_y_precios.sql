-- 0057 · COMMERCE · cobros, pagos, precios y vencimientos
-- Correcciones al portar:
--   · mark_overdue_orders marcaba vencidos los pedidos de TODAS las empresas
--     con el mismo criterio, leyendo un settings global. Ahora recorre empresa
--     por empresa con la configuracion de cada una.
--   · price_for leia el descuento por volumen de un settings global.
--   · los registros de cobro y pago no verificaban la empresa del documento.

create or replace function public.price_for(_product_id uuid, _customer_id uuid default null,
  _quantity numeric default 0)
returns numeric language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_price numeric; v_min_kg numeric; v_disc numeric; v_company uuid;
begin
  select company_id into v_company from public.products where id = _product_id;
  if v_company is null or not public.is_company_member(v_company) then return 0; end if;

  if _customer_id is not null then
    select price into v_price from public.customer_special_prices
     where customer_id = _customer_id and product_id = _product_id and company_id = v_company;
  end if;
  if v_price is null then
    select sale_price into v_price from public.products where id = _product_id;
  end if;

  v_min_kg := coalesce(public.company_setting(v_company,'operacion','descuento_volumen_kg')::numeric, 0);
  v_disc   := coalesce(public.company_setting(v_company,'operacion','descuento_volumen_pct')::numeric, 0);
  if v_min_kg > 0 and _quantity >= v_min_kg and v_disc > 0 then
    v_price := round(v_price * (1 - v_disc / 100));
  end if;
  return coalesce(v_price, 0);
end $$;

create or replace function public.register_collection(_origen text, _ref_id uuid, _amount numeric,
  _method public.payment_method default 'transferencia', _reference text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_cliente uuid; v_company uuid;
begin
  if _amount <= 0 then raise exception 'El monto debe ser mayor a cero'; end if;

  if _origen = 'pedido' then
    select customer_id, company_id into v_cliente, v_company from public.orders where id = _ref_id;
  elsif _origen = 'saldo_inicial' then
    select customer_id, company_id into v_cliente, v_company from public.opening_receivables where id = _ref_id;
  else
    raise exception 'Origen no valido';
  end if;

  perform public.assert_company(v_company, 60);
  if not (public.is_admin() or public.has_perm('payments','create')) then
    raise exception 'Sin permiso para registrar cobros';
  end if;

  if _origen = 'pedido' then
    insert into public.payments (company_id, direction, order_id, customer_id, amount, method, reference, created_by)
    values (v_company, 'cobro', _ref_id, v_cliente, _amount, _method, _reference, (select auth.uid()));
  else
    insert into public.payments (company_id, direction, opening_receivable_id, customer_id, amount, method, reference, created_by)
    values (v_company, 'cobro', _ref_id, v_cliente, _amount, _method, _reference, (select auth.uid()));
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.register_payment_out(_origen text, _ref_id uuid, _amount numeric,
  _method public.payment_method default 'transferencia', _reference text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prov uuid; v_company uuid;
begin
  if _amount <= 0 then raise exception 'El monto debe ser mayor a cero'; end if;

  if _origen = 'compra' then
    select supplier_id, company_id into v_prov, v_company from public.purchases where id = _ref_id;
  elsif _origen = 'saldo_inicial' then
    select supplier_id, company_id into v_prov, v_company from public.opening_payables where id = _ref_id;
  else
    raise exception 'Origen no valido';
  end if;

  perform public.assert_company(v_company, 60);
  if not (public.is_admin() or public.has_perm('payments','create')) then
    raise exception 'Sin permiso para registrar pagos';
  end if;

  if _origen = 'compra' then
    insert into public.payments (company_id, direction, purchase_id, supplier_id, amount, method, reference, created_by)
    values (v_company, 'pago', _ref_id, v_prov, _amount, _method, _reference, (select auth.uid()));
  else
    insert into public.payments (company_id, direction, opening_payable_id, supplier_id, amount, method, reference, created_by)
    values (v_company, 'pago', _ref_id, v_prov, _amount, _method, _reference, (select auth.uid()));
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.set_customer_location(_customer_id uuid, _lat numeric, _lng numeric,
  _source text default 'manual')
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_company uuid;
begin
  select company_id into v_company from public.customers where id = _customer_id;
  perform public.assert_company(v_company, 40);
  if not (public.is_admin() or public.has_perm('customers','update')) then
    raise exception 'Sin permiso para editar clientes';
  end if;
  if _lat is null or _lng is null then raise exception 'Coordenadas incompletas'; end if;
  if _lat < -90 or _lat > 90 or _lng < -180 or _lng > 180 then
    raise exception 'Coordenadas fuera de rango';
  end if;
  update public.customers
     set latitude = _lat, longitude = _lng, geocoded_at = now(), geocode_source = _source
   where id = _customer_id;
  return jsonb_build_object('ok', true);
end $$;

-- Aplica el pago al documento correspondiente. Opera por id, y los ids son
-- unicos, asi que no cruza empresas; el RLS del insert ya la valido.
create or replace function public.trg_apply_payment()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_total numeric; v_paid numeric;
begin
  if new.order_id is not null then
    select total into v_total from public.orders where id = new.order_id;
    select coalesce(sum(amount),0) into v_paid from public.payments
     where order_id = new.order_id and direction = 'cobro';
    update public.orders
       set amount_paid = v_paid,
           payment_status = (case
             when v_paid >= v_total and v_total > 0 then 'pagado'
             when v_paid > 0 then 'parcial'
             when due_date is not null and due_date < current_date then 'vencido'
             else 'pendiente' end)::public.payment_status
     where id = new.order_id;
  end if;

  if new.purchase_id is not null then
    select total into v_total from public.purchases where id = new.purchase_id;
    select coalesce(sum(amount),0) into v_paid from public.payments
     where purchase_id = new.purchase_id and direction = 'pago';
    update public.purchases
       set amount_paid = v_paid,
           payment_status = (case
             when v_paid >= v_total and v_total > 0 then 'pagado'
             when v_paid > 0 then 'parcial' else 'pendiente' end)::public.payment_status
     where id = new.purchase_id;
  end if;

  if new.opening_receivable_id is not null then
    select coalesce(sum(amount),0) into v_paid from public.payments
     where opening_receivable_id = new.opening_receivable_id and direction = 'cobro';
    update public.opening_receivables set amount_paid = v_paid where id = new.opening_receivable_id;
  end if;

  if new.opening_payable_id is not null then
    select coalesce(sum(amount),0) into v_paid from public.payments
     where opening_payable_id = new.opening_payable_id and direction = 'pago';
    update public.opening_payables set amount_paid = v_paid where id = new.opening_payable_id;
  end if;

  return new;
end $$;
revoke execute on function public.trg_apply_payment() from public, anon, authenticated;
drop trigger if exists payments_apply on public.payments;
create trigger payments_apply after insert on public.payments
  for each row execute function public.trg_apply_payment();

-- Recorre empresa por empresa con la configuracion de cada una.
create or replace function public.mark_overdue_orders()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare c record; v_gracia int; v_n int; v_total int := 0;
begin
  for c in select id from public.companies where status in ('trial','active') loop
    v_gracia := coalesce(public.company_setting(c.id,'operacion','dias_para_vencido')::int, 30)
              - coalesce(public.company_setting(c.id,'operacion','dias_credito_default')::int, 30);
    with upd as (
      update public.orders set payment_status = 'vencido'
      where company_id = c.id
        and status <> 'cancelado' and payment_status in ('pendiente','parcial')
        and due_date is not null and due_date + greatest(v_gracia, 0) < current_date
      returning 1
    ) select count(*) into v_n from upd;
    v_total := v_total + v_n;
  end loop;
  return v_total;
end $$;

do $$
declare f text;
begin
  foreach f in array array['price_for(uuid,uuid,numeric)',
    'register_collection(text,uuid,numeric,public.payment_method,text)',
    'register_payment_out(text,uuid,numeric,public.payment_method,text)',
    'set_customer_location(uuid,numeric,numeric,text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke execute on function public.mark_overdue_orders() from public, anon, authenticated;