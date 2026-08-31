-- 0066 · Los paneles aceptan la empresa como argumento
-- dashboard_kpis y finance_kpis dependian de current_company(), que sin la
-- variable de sesion cae en "la pertenencia mas antigua". Desde el navegador
-- esa variable no se puede fijar, asi que un usuario con dos empresas veria
-- siempre las cifras de la primera. El portal necesita pedir una empresa
-- concreta, igual que el resto de las funciones.

create or replace function public.dashboard_kpis(p_company uuid default null)
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  with c as (select coalesce(p_company, public.current_company()) as id)
  select jsonb_build_object(
    'ventas_hoy',   (select coalesce(sum(total),0) from public.orders, c
                      where orders.company_id = c.id and status <> 'cancelado' and order_date::date = current_date),
    'ventas_semana',(select coalesce(sum(total),0) from public.orders, c
                      where orders.company_id = c.id and status <> 'cancelado' and order_date >= date_trunc('week', now())),
    'ventas_mes',   (select coalesce(sum(total),0) from public.orders, c
                      where orders.company_id = c.id and status <> 'cancelado' and order_date >= date_trunc('month', now())),
    'compras_mes',  (select coalesce(sum(total),0) from public.purchases, c
                      where purchases.company_id = c.id and status = 'recibida' and purchase_date >= date_trunc('month', now())::date),
    'margen_mes',   (select coalesce(sum(total - cost_total),0) from public.orders, c
                      where orders.company_id = c.id and status <> 'cancelado' and order_date >= date_trunc('month', now())),
    'pedidos_pendientes',    (select count(*) from public.orders, c
                      where orders.company_id = c.id and status in ('nuevo','confirmado','en_preparacion','preparado')),
    'pedidos_en_reparto',    (select count(*) from public.orders, c
                      where orders.company_id = c.id and status = 'en_reparto'),
    'pedidos_entregados_hoy',(select count(*) from public.orders, c
                      where orders.company_id = c.id and status = 'entregado' and delivered_at::date = current_date),
    'stock_total',  (select coalesce(sum(quantity_on_hand),0) from public.inventory_lots, c
                      where inventory_lots.company_id = c.id and status = 'disponible'),
    'stock_valor',  (select coalesce(sum(quantity_on_hand * unit_cost),0) from public.inventory_lots, c
                      where inventory_lots.company_id = c.id and status = 'disponible'),
    'productos_stock_bajo', (select count(*) from public.v_product_stock v, c
                      where v.company_id = c.id and v.min_stock > 0 and v.available < v.min_stock and v.status = 'activo'),
    'productos_total', (select count(*) from public.products, c
                      where products.company_id = c.id and status = 'activo'),
    'clientes_activos', (select count(*) from public.customers, c
                      where customers.company_id = c.id and status = 'activo'),
    'proveedores', (select count(*) from public.suppliers, c
                      where suppliers.company_id = c.id and status = 'activo'),
    'cuentas_por_cobrar', (select coalesce(sum(total - amount_paid),0) from public.orders, c
                      where orders.company_id = c.id and status <> 'cancelado' and payment_status <> 'pagado'),
    'cuentas_vencidas', (select coalesce(sum(total - amount_paid),0) from public.orders, c
                      where orders.company_id = c.id and status <> 'cancelado' and payment_status <> 'pagado' and due_date < current_date),
    'compras_historico', (select coalesce(sum(monto_total),0) from public.purchase_history, c
                      where purchase_history.company_id = c.id)
  );
$$;
revoke execute on function public.dashboard_kpis(uuid) from public, anon;
grant  execute on function public.dashboard_kpis(uuid) to authenticated;

-- Resumen de la organizacion para el portal: quien soy, donde estoy, que tengo
create or replace function public.mi_espacio(p_company uuid)
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'empresa',   (select jsonb_build_object('id',c.id,'nombre',c.name,'slug',c.slug,
                         'moneda',c.currency,'pais',c.country,'estado',c.status,
                         'linea', pl.name, 'linea_slug', pl.slug)
                  from public.companies c
                  left join public.product_lines pl on pl.id = c.product_line_id
                  where c.id = p_company),
    'plan',      (select jsonb_build_object('nombre',p.name,'estado',s.status,'precio',s.price_amount)
                  from public.subscriptions s join public.plans p on p.id = s.plan_id
                  where s.company_id = p_company limit 1),
    'modulos',   (select coalesce(jsonb_agg(jsonb_build_object(
                         'slug',x.modulo,'encendido',x.encendido,
                         'en_el_plan',x.en_el_plan,'disponible',x.disponible)),'[]'::jsonb)
                  from public.company_plan_state(p_company) x),
    'features',  (select coalesce(jsonb_agg(jsonb_build_object(
                         'slug',f.slug,'nombre',f.name,'etapa',f.stage,'descripcion',f.description)),'[]'::jsonb)
                  from public.company_features cf join public.features f on f.id = cf.feature_id
                  where cf.company_id = p_company and cf.enabled),
    'mi_rol',    (select jsonb_build_object('nombre',r.name,'nivel',r.level,'funcional',cm.job_role)
                  from public.company_members cm join public.roles r on r.id = cm.role_id
                  where cm.company_id = p_company and cm.user_id = (select auth.uid()) limit 1)
  );
$$;
revoke execute on function public.mi_espacio(uuid) from public, anon;
grant  execute on function public.mi_espacio(uuid) to authenticated;