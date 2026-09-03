-- ===========================================================
-- 0088 · Análisis financiero
--
-- Informes responde "cuánto vendí". Esto responde lo otro: si el
-- negocio gana plata, dónde se queda, a quién le debe y quién le
-- debe, y qué mirar primero. Es un addon —vive en `features` y se
-- enciende por empresa— porque no toda empresa lo necesita, y las
-- que lo necesitan lo necesitan entero.
--
-- Una sola función devuelve el análisis completo, por la misma razón
-- que `informe_ventas()`: si el margen se calculara en la pantalla,
-- dos vistas del mismo mes darían cifras distintas y no habría cómo
-- saber cuál miente.
--
-- Lo que entra en cada cifra, dicho una vez:
--   ingresos     · pedidos no cancelados, por fecha de pedido
--   costo        · el costo cargado en el pedido (cost_total)
--   compras      · compras recibidas, por fecha de compra
--   mermas       · pérdidas registradas, a costo
--   gastos       · finance_entries de tipo 'expense'
--   cobros/pagos · payments, que es caja de verdad, no devengo
--
-- Por eso hay dos resultados y no uno: el devengado (lo que el
-- negocio ganó) y la caja (lo que entró y salió). Un negocio puede
-- ganar y quedarse sin efectivo, y esa diferencia es justo la que
-- una sola cifra esconde.
-- ===========================================================

-- 1 · El addon ------------------------------------------------------
insert into public.features (slug, name, description, module_slug, stage, default_enabled)
values ('analisis_financiero',
        'Análisis financiero',
        'Resultado, caja, cobros y pagos, rentabilidad por cliente y producto, y alertas sobre lo que hay que mirar.',
        'finance', 'oficial', true)
on conflict (slug) do update
   set name = excluded.name,
       description = excluded.description,
       module_slug = excluded.module_slug,
       stage = excluded.stage,
       default_enabled = excluded.default_enabled;

/* Se enciende para toda empresa que tenga Finanzas en su plan: el
   análisis no sirve de nada sin el módulo que lo alimenta. */
insert into public.company_features (company_id, feature_id, enabled)
select c.id, f.id, true
  from public.companies c
  cross join public.features f
 where f.slug = 'analisis_financiero'
   and exists (select 1 from public.subscriptions s
                join public.plan_modules pm on pm.plan_id = s.plan_id
                join public.modules m on m.id = pm.module_id and m.slug = 'finance'
               where s.company_id = c.id and s.status in ('prueba','activa','morosa'))
on conflict (company_id, feature_id) do update set enabled = true;

-- 2 · El análisis ---------------------------------------------------
create or replace function public.analisis_financiero(
  p_company uuid,
  p_desde date default (current_date - 180),
  p_hasta date default current_date)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_dias    integer := greatest(1, (p_hasta - p_desde) + 1);
  v_antes_d date    := p_desde - v_dias;   -- el tramo anterior, del mismo largo
  v_antes_h date    := p_desde - 1;
  v_moneda  text;
  r         jsonb;
  -- devengado
  v_ingresos numeric := 0; v_costo numeric := 0; v_pedidos integer := 0;
  v_compras  numeric := 0; v_mermas numeric := 0; v_gastos numeric := 0;
  v_margen   numeric := 0; v_resultado numeric := 0;
  -- comparación
  v_ing_antes numeric := 0; v_mar_antes numeric := 0; v_res_antes numeric := 0;
  v_gas_antes numeric := 0; v_com_antes numeric := 0;
  -- caja
  v_cobros numeric := 0; v_pagos numeric := 0;
  -- posición
  v_cobrar numeric := 0; v_cobrar_venc numeric := 0; v_cobrar_docs integer := 0;
  v_pagar  numeric := 0; v_pagar_venc  numeric := 0; v_pagar_docs  integer := 0;
  v_inv    numeric := 0; v_lotes integer := 0;
  v_dso numeric; v_dpo numeric;
  alertas jsonb := '[]'::jsonb;
begin
  /* Finanzas es un módulo de nivel 60: quien no llega, no lo ve. Se
     devuelve vacío en vez de fallar para que la pantalla pueda decirlo
     con calma en vez de mostrar un error rojo. */
  if not public.has_company_level(p_company, 60) then
    return '{}'::jsonb;
  end if;

  select currency into v_moneda from public.companies where id = p_company;

  -- ---------- devengado ----------
  select coalesce(sum(o.total),0), coalesce(sum(o.cost_total),0), count(*)
    into v_ingresos, v_costo, v_pedidos
    from public.orders o
   where o.company_id = p_company and o.status <> 'cancelado'
     and o.order_date::date between p_desde and p_hasta;

  select coalesce(sum(p.total),0) into v_compras
    from public.purchases p
   where p.company_id = p_company and p.status = 'recibida'
     and p.purchase_date between p_desde and p_hasta;

  select coalesce(sum(l.cost),0) into v_mermas
    from public.losses l
   where l.company_id = p_company
     and l.created_at::date between p_desde and p_hasta;

  select coalesce(sum(f.amount),0) into v_gastos
    from public.finance_entries f
   where f.company_id = p_company and f.kind = 'expense'
     and coalesce(f.occurred_at, f.created_at::date) between p_desde and p_hasta;

  v_margen    := v_ingresos - v_costo;
  v_resultado := v_margen - v_gastos - v_mermas;

  -- ---------- el mismo tramo, antes ----------
  select coalesce(sum(o.total),0), coalesce(sum(o.total - o.cost_total),0)
    into v_ing_antes, v_mar_antes
    from public.orders o
   where o.company_id = p_company and o.status <> 'cancelado'
     and o.order_date::date between v_antes_d and v_antes_h;

  select coalesce(sum(f.amount),0) into v_gas_antes
    from public.finance_entries f
   where f.company_id = p_company and f.kind = 'expense'
     and coalesce(f.occurred_at, f.created_at::date) between v_antes_d and v_antes_h;

  select coalesce(sum(p.total),0) into v_com_antes
    from public.purchases p
   where p.company_id = p_company and p.status = 'recibida'
     and p.purchase_date between v_antes_d and v_antes_h;

  v_res_antes := v_mar_antes - v_gas_antes;

  -- ---------- caja ----------
  select coalesce(sum(amount) filter (where direction = 'cobro'), 0),
         coalesce(sum(amount) filter (where direction = 'pago'),  0)
    into v_cobros, v_pagos
    from public.payments
   where company_id = p_company and paid_at::date between p_desde and p_hasta;

  -- ---------- lo que deben y lo que se debe ----------
  select coalesce(sum(saldo),0),
         coalesce(sum(saldo) filter (where vence < current_date), 0),
         count(*)
    into v_cobrar, v_cobrar_venc, v_cobrar_docs
    from (
      select (o.total - o.amount_paid) as saldo,
             coalesce(o.due_date, o.order_date::date) as vence
        from public.orders o
       where o.company_id = p_company and o.status <> 'cancelado'
         and o.total > o.amount_paid
      union all
      select (r.amount - r.amount_paid), coalesce(r.due_date, r.issued_at)
        from public.opening_receivables r
       where r.company_id = p_company and r.amount > r.amount_paid
    ) x;

  select coalesce(sum(saldo),0),
         coalesce(sum(saldo) filter (where vence < current_date), 0),
         count(*)
    into v_pagar, v_pagar_venc, v_pagar_docs
    from (
      select (p.total - p.amount_paid) as saldo,
             coalesce(p.due_date, p.purchase_date) as vence
        from public.purchases p
       where p.company_id = p_company and p.status = 'recibida'
         and p.total > p.amount_paid
      union all
      select (a.amount - a.amount_paid), coalesce(a.due_date, a.issued_at)
        from public.opening_payables a
       where a.company_id = p_company and a.amount > a.amount_paid
    ) y;

  select count(*), coalesce(sum(quantity_on_hand * unit_cost), 0)
    into v_lotes, v_inv
    from public.inventory_lots
   where company_id = p_company and status = 'disponible';

  /* Días de cobro y de pago: cuánto tarda en volver lo vendido y cuánto
     se tarda en pagar lo comprado. Sin base no se inventa un número. */
  v_dso := case when v_ingresos > 0 then round(v_cobrar / v_ingresos * v_dias) end;
  v_dpo := case when v_compras  > 0 then round(v_pagar  / v_compras  * v_dias) end;

  -- ---------- lo que hay que mirar ----------
  if v_ingresos > 0 and v_margen / v_ingresos < 0.15 then
    alertas := alertas || jsonb_build_object(
      'clave','margen_bajo','tono','malo','titulo','El margen está por debajo del 15%',
      'detalle', 'De cada 100 que vendes te quedan ' ||
                 round(v_margen / v_ingresos * 100)::text ||
                 '. Revisa precios de venta y costo de compra antes de vender más.');
  end if;

  if v_resultado < 0 then
    alertas := alertas || jsonb_build_object(
      'clave','resultado_negativo','tono','malo','titulo','El período cierra en pérdida',
      'detalle','El margen no alcanza a cubrir gastos y mermas. La diferencia sale del bolsillo o de la deuda.');
  end if;

  if v_cobrar > 0 and v_cobrar_venc / nullif(v_cobrar,0) > 0.3 then
    alertas := alertas || jsonb_build_object(
      'clave','morosidad','tono','malo','titulo','Más de un tercio de lo por cobrar está vencido',
      'detalle', round(v_cobrar_venc / v_cobrar * 100)::text ||
                 '% de la deuda pasó su fecha. Cobrar eso es más barato que vender lo mismo de nuevo.');
  end if;

  if v_dso is not null and v_dpo is not null and v_dso > v_dpo + 15 then
    alertas := alertas || jsonb_build_object(
      'clave','desfase','tono','aviso','titulo','Cobras más lento de lo que pagas',
      'detalle','Tardas ' || v_dso::text || ' días en cobrar y pagas en ' || v_dpo::text ||
                '. Ese desfase lo financias tú.');
  end if;

  if v_cobros > 0 and v_pagos > v_cobros then
    alertas := alertas || jsonb_build_object(
      'clave','caja_negativa','tono','aviso','titulo','Salió más plata de la que entró',
      'detalle','En el período pagaste más de lo que cobraste. Puede ser normal si compraste stock; no lo es dos períodos seguidos.');
  end if;

  if v_inv > 0 and v_ingresos > 0 and v_inv > v_ingresos * 0.5 then
    alertas := alertas || jsonb_build_object(
      'clave','inventario_alto','tono','aviso','titulo','Hay mucha plata detenida en bodega',
      'detalle','El inventario vale más de la mitad de lo que vendiste en el período.');
  end if;

  -- ---------- armar la respuesta ----------
  r := jsonb_build_object(
    'periodo', jsonb_build_object('desde', p_desde, 'hasta', p_hasta,
                                  'dias', v_dias, 'moneda', v_moneda),

    'resultado', jsonb_build_object(
      'ingresos', v_ingresos, 'costo_ventas', v_costo, 'margen_bruto', v_margen,
      'margen_pct', case when v_ingresos > 0 then round(v_margen / v_ingresos * 100, 1) else null end,
      'compras', v_compras, 'mermas', v_mermas, 'gastos', v_gastos,
      'resultado_neto', v_resultado, 'pedidos', v_pedidos,
      'ticket', case when v_pedidos > 0 then round(v_ingresos / v_pedidos) else 0 end),

    'antes', jsonb_build_object('ingresos', v_ing_antes, 'margen_bruto', v_mar_antes,
                                'resultado_neto', v_res_antes, 'gastos', v_gas_antes,
                                'compras', v_com_antes,
                                'desde', v_antes_d, 'hasta', v_antes_h),

    'caja', jsonb_build_object('cobros', v_cobros, 'pagos', v_pagos, 'neto', v_cobros - v_pagos),

    'cobrar', jsonb_build_object('total', v_cobrar, 'vencido', v_cobrar_venc,
                                 'documentos', v_cobrar_docs, 'dias', v_dso),
    'pagar',  jsonb_build_object('total', v_pagar,  'vencido', v_pagar_venc,
                                 'documentos', v_pagar_docs,  'dias', v_dpo),
    'inventario', jsonb_build_object('valor', v_inv, 'lotes', v_lotes),
    'capital_trabajo', v_cobrar + v_inv - v_pagar,

    'series', jsonb_build_object(
      'mensual', (
        select coalesce(jsonb_agg(m order by m->>'mes'), '[]'::jsonb) from (
          select jsonb_build_object(
                   'mes', mes,
                   'ingresos', coalesce(sum(ingresos),0),
                   'costo',    coalesce(sum(costo),0),
                   'margen',   coalesce(sum(ingresos - costo),0),
                   'gastos',   coalesce(sum(gastos),0),
                   'resultado',coalesce(sum(ingresos - costo - gastos),0)) as m
            from (
              select to_char(date_trunc('month', o.order_date), 'YYYY-MM') as mes,
                     o.total as ingresos, o.cost_total as costo, 0::numeric as gastos
                from public.orders o
               where o.company_id = p_company and o.status <> 'cancelado'
                 and o.order_date::date between p_desde and p_hasta
              union all
              select to_char(date_trunc('month', coalesce(f.occurred_at, f.created_at::date)), 'YYYY-MM'),
                     0, 0, f.amount
                from public.finance_entries f
               where f.company_id = p_company and f.kind = 'expense'
                 and coalesce(f.occurred_at, f.created_at::date) between p_desde and p_hasta
            ) u
           group by mes) s),

      'caja', (
        select coalesce(jsonb_agg(m order by m->>'mes'), '[]'::jsonb) from (
          select jsonb_build_object(
                   'mes', to_char(date_trunc('month', pa.paid_at), 'YYYY-MM'),
                   'cobros', coalesce(sum(pa.amount) filter (where pa.direction='cobro'),0),
                   'pagos',  coalesce(sum(pa.amount) filter (where pa.direction='pago'),0),
                   'neto',   coalesce(sum(case when pa.direction='cobro' then pa.amount else -pa.amount end),0)) as m
            from public.payments pa
           where pa.company_id = p_company
             and pa.paid_at::date between p_desde and p_hasta
           group by date_trunc('month', pa.paid_at)) s)),

    'aging_cobros', (
      select coalesce(jsonb_agg(t order by t->>'orden'), '[]'::jsonb) from (
        select jsonb_build_object('orden', tr.orden, 'tramo', tr.nombre,
                 'monto', coalesce(sum(d.saldo),0), 'documentos', count(d.saldo)) as t
          from (values (1,'Por vencer',-100000,0), (2,'1 a 30 días',0,30),
                       (3,'31 a 60 días',30,60), (4,'61 a 90 días',60,90),
                       (5,'Más de 90 días',90,100000)) as tr(orden,nombre,desde,hasta)
          left join (
            select (o.total - o.amount_paid) as saldo,
                   (current_date - coalesce(o.due_date, o.order_date::date)) as edad
              from public.orders o
             where o.company_id = p_company and o.status <> 'cancelado'
               and o.total > o.amount_paid
            union all
            select (r.amount - r.amount_paid),
                   (current_date - coalesce(r.due_date, r.issued_at))
              from public.opening_receivables r
             where r.company_id = p_company and r.amount > r.amount_paid
          ) d on d.edad > tr.desde and d.edad <= tr.hasta
         group by tr.orden, tr.nombre) s),

    'aging_pagos', (
      select coalesce(jsonb_agg(t order by t->>'orden'), '[]'::jsonb) from (
        select jsonb_build_object('orden', tr.orden, 'tramo', tr.nombre,
                 'monto', coalesce(sum(d.saldo),0), 'documentos', count(d.saldo)) as t
          from (values (1,'Por vencer',-100000,0), (2,'1 a 30 días',0,30),
                       (3,'31 a 60 días',30,60), (4,'61 a 90 días',60,90),
                       (5,'Más de 90 días',90,100000)) as tr(orden,nombre,desde,hasta)
          left join (
            select (p.total - p.amount_paid) as saldo,
                   (current_date - coalesce(p.due_date, p.purchase_date)) as edad
              from public.purchases p
             where p.company_id = p_company and p.status = 'recibida'
               and p.total > p.amount_paid
            union all
            select (a.amount - a.amount_paid),
                   (current_date - coalesce(a.due_date, a.issued_at))
              from public.opening_payables a
             where a.company_id = p_company and a.amount > a.amount_paid
          ) d on d.edad > tr.desde and d.edad <= tr.hasta
         group by tr.orden, tr.nombre) s),

    /* Quién sostiene el negocio y cuánto pesa. La participación es lo que
       importa: un cliente que es el 60% de la venta no es una buena noticia,
       es un riesgo con nombre. */
    'clientes', (
      select coalesce(jsonb_agg(c), '[]'::jsonb) from (
        select jsonb_build_object(
                 'nombre', cu.name,
                 'ventas', sum(o.total),
                 'margen', sum(o.total - o.cost_total),
                 'margen_pct', case when sum(o.total) > 0
                                    then round(sum(o.total - o.cost_total) / sum(o.total) * 100, 1) end,
                 'participacion', case when v_ingresos > 0
                                       then round(sum(o.total) / v_ingresos * 100, 1) else 0 end,
                 'deuda', coalesce(sum(o.total - o.amount_paid), 0),
                 'pedidos', count(*)) as c
          from public.orders o
          join public.customers cu on cu.id = o.customer_id
         where o.company_id = p_company and o.status <> 'cancelado'
           and o.order_date::date between p_desde and p_hasta
         group by cu.id, cu.name
         order by sum(o.total) desc
         limit 12) s),

    'productos', (
      select coalesce(jsonb_agg(p), '[]'::jsonb) from (
        select jsonb_build_object(
                 'nombre', pr.name,
                 'unidades', sum(oi.quantity_ordered),
                 'ventas',  sum(oi.line_total),
                 'costo',   sum(oi.quantity_ordered * coalesce(oi.unit_cost,0)),
                 'margen',  sum(oi.line_total - oi.quantity_ordered * coalesce(oi.unit_cost,0)),
                 'margen_pct', case when sum(oi.line_total) > 0
                                    then round((sum(oi.line_total - oi.quantity_ordered * coalesce(oi.unit_cost,0))
                                                / sum(oi.line_total)) * 100, 1) end) as p
          from public.order_items oi
          join public.orders o    on o.id = oi.order_id
          join public.products pr on pr.id = oi.product_id
         where oi.company_id = p_company and o.status <> 'cancelado'
           and o.order_date::date between p_desde and p_hasta
         group by pr.id, pr.name
         order by sum(oi.line_total) desc
         limit 12) s),

    'gastos', (
      select coalesce(jsonb_agg(g order by (g->>'monto')::numeric desc), '[]'::jsonb) from (
        select jsonb_build_object(
                 'categoria', coalesce(nullif(f.category,''), 'Sin categoría'),
                 'monto', sum(f.amount),
                 'participacion', case when v_gastos > 0
                                       then round(sum(f.amount) / v_gastos * 100, 1) else 0 end,
                 'movimientos', count(*)) as g
          from public.finance_entries f
         where f.company_id = p_company and f.kind = 'expense'
           and coalesce(f.occurred_at, f.created_at::date) between p_desde and p_hasta
         group by coalesce(nullif(f.category,''), 'Sin categoría')) s),

    'alertas', alertas
  );

  return r;
end $$;

comment on function public.analisis_financiero(uuid, date, date) is
  'Análisis financiero completo de una empresa: resultado devengado, caja, cobros y pagos con antigüedad, rentabilidad por cliente y producto, gastos por categoría y alertas. Nivel 60.';

revoke all on function public.analisis_financiero(uuid, date, date) from anon;
grant execute on function public.analisis_financiero(uuid, date, date) to authenticated;
