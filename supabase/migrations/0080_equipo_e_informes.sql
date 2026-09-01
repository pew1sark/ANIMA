-- 0080 — El equipo de la empresa, y los informes
--
-- Dos cosas que faltaban para que una empresa pueda operar sola:
--
--   1. Dar de alta a su gente. Hoy `user_invitations` existe pero nadie la
--      consume: invitar no hacía nada. Aquí se cierra el círculo.
--   2. Ver cómo va. Los datos están; faltaba preguntarles.

begin;

-- ---------------------------------------------------------------------------
-- 1. Una invitación que sirve de algo
-- ---------------------------------------------------------------------------
-- Se invita por correo. Cuando esa persona entra por primera vez —con la
-- cuenta que se le creó— esta función encuentra la invitación y la convierte
-- en membresía. Sin correo saliente todavía: el aviso lo da quien invita.
--
-- Se llama al entrar, siempre. Si no hay nada pendiente no hace nada.

create or replace function public.aceptar_invitaciones()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid   uuid := (select auth.uid());
  v_email text;
  v_n     integer := 0;
  v_inv   record;
begin
  if v_uid is null then return 0; end if;

  select lower(email) into v_email from auth.users where id = v_uid;
  if v_email is null then return 0; end if;

  for v_inv in
    select i.id, i.company_id, i.role_id
      from public.user_invitations i
     where lower(i.email) = v_email
       and i.used_at is null
       and i.expires_at > now()
  loop
    /* Si ya es miembro, la invitación se da por usada igual: el objetivo era
       que estuviera dentro, y ya lo está. */
    insert into public.company_members (company_id, user_id, role_id, status)
    select v_inv.company_id, v_uid,
           coalesce(v_inv.role_id, (select id from public.roles
                                     where slug = 'employee' and scope = 'company')),
           'active'
     where not exists (
       select 1 from public.company_members m
        where m.company_id = v_inv.company_id and m.user_id = v_uid);

    update public.user_invitations
       set used_at = now(), used_by = v_uid
     where id = v_inv.id;

    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$fn$;

comment on function public.aceptar_invitaciones() is
  'Convierte en membresías las invitaciones pendientes del correo de quien entra.';

revoke all on function public.aceptar_invitaciones() from public, anon;
grant execute on function public.aceptar_invitaciones() to authenticated;

-- Ver el equipo con nombre y correo: `company_members` guarda el uuid, y el
-- correo vive en auth.users, que no se puede leer desde el cliente.
create or replace function public.equipo(p_company uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select coalesce(jsonb_agg(x order by x->>'nivel' desc, x->>'correo'), '[]'::jsonb)
    from (
      select jsonb_build_object(
               'id',      m.id,
               'user_id', m.user_id,
               'correo',  u.email,
               'nombre',  coalesce(p.full_name, u.raw_user_meta_data->>'name'),
               'rol',     r.name,
               'rol_slug',r.slug,
               'nivel',   r.level,
               'estado',  m.status,
               'desde',   m.created_at,
               'soy_yo',  m.user_id = (select auth.uid())
             ) as x
        from public.company_members m
        join auth.users u on u.id = m.user_id
        join public.roles r on r.id = m.role_id
        left join public.profiles p on p.id = m.user_id
       where m.company_id = p_company
         and public.has_company_level(p_company, 60)
    ) t;
$fn$;

comment on function public.equipo(uuid) is
  'Quién trabaja en la empresa, con su rol. Desde nivel 60.';

revoke all on function public.equipo(uuid) from public, anon;
grant execute on function public.equipo(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Los informes
-- ---------------------------------------------------------------------------
-- Se calculan en la base por la misma razón que los totales: para que no haya
-- dos respuestas distintas a la misma pregunta.

create or replace function public.informe_ventas(
  p_company uuid,
  p_desde   date default (current_date - 180),
  p_hasta   date default current_date
) returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select case when not public.has_company_level(p_company, 40) then '{}'::jsonb else
    jsonb_build_object(

      'resumen', (
        select jsonb_build_object(
          'ventas',   coalesce(sum(o.total), 0),
          'costo',    coalesce(sum(o.cost_total), 0),
          'margen',   coalesce(sum(o.total - o.cost_total), 0),
          'pedidos',  count(*),
          'ticket',   case when count(*) = 0 then 0
                           else round(coalesce(sum(o.total), 0) / count(*)) end,
          'cobrado',  coalesce(sum(o.amount_paid), 0),
          'por_cobrar', coalesce(sum(o.total - o.amount_paid), 0))
        from public.orders o
       where o.company_id = p_company
         and o.status <> 'cancelado'
         and o.order_date::date between p_desde and p_hasta),

      'por_mes', (
        select coalesce(jsonb_agg(m order by m->>'mes'), '[]'::jsonb) from (
          select jsonb_build_object(
                   'mes',     to_char(date_trunc('month', o.order_date), 'YYYY-MM'),
                   'ventas',  sum(o.total),
                   'margen',  sum(o.total - o.cost_total),
                   'pedidos', count(*)) as m
            from public.orders o
           where o.company_id = p_company
             and o.status <> 'cancelado'
             and o.order_date::date between p_desde and p_hasta
           group by date_trunc('month', o.order_date)) s),

      'top_clientes', (
        select coalesce(jsonb_agg(c), '[]'::jsonb) from (
          select jsonb_build_object(
                   'nombre',  cu.name,
                   'ventas',  sum(o.total),
                   'pedidos', count(*)) as c
            from public.orders o
            join public.customers cu on cu.id = o.customer_id
           where o.company_id = p_company
             and o.status <> 'cancelado'
             and o.order_date::date between p_desde and p_hasta
           group by cu.id, cu.name
           order by sum(o.total) desc
           limit 10) s),

      'top_productos', (
        select coalesce(jsonb_agg(p), '[]'::jsonb) from (
          select jsonb_build_object(
                   'nombre',   pr.name,
                   'cantidad', sum(oi.quantity_ordered),
                   'ventas',   sum(oi.line_total)) as p
            from public.order_items oi
            join public.orders o   on o.id = oi.order_id
            join public.products pr on pr.id = oi.product_id
           where oi.company_id = p_company
             and o.status <> 'cancelado'
             and o.order_date::date between p_desde and p_hasta
           group by pr.id, pr.name
           order by sum(oi.line_total) desc
           limit 10) s),

      /* La antigüedad de la deuda: no es lo mismo deber hace tres días que
         hace tres meses, y el total solo no lo dice. */
      'cobranza', (
        select coalesce(jsonb_agg(t order by t->>'orden'), '[]'::jsonb) from (
          select jsonb_build_object(
                   'orden', tramo.orden,
                   'tramo', tramo.nombre,
                   'monto', coalesce(sum(o.total - o.amount_paid), 0),
                   'documentos', count(o.id)) as t
            from (values (1, 'Por vencer',   -100000, 0),
                         (2, '1 a 30 días',       0, 30),
                         (3, '31 a 60 días',     30, 60),
                         (4, '61 a 90 días',     60, 90),
                         (5, 'Más de 90 días',   90, 100000)) as tramo(orden, nombre, desde, hasta)
            left join public.orders o
              on o.company_id = p_company
             and o.status <> 'cancelado'
             and o.total > o.amount_paid
             and (current_date - coalesce(o.due_date, o.order_date::date)) > tramo.desde
             and (current_date - coalesce(o.due_date, o.order_date::date)) <= tramo.hasta
           group by tramo.orden, tramo.nombre) s),

      'inventario', (
        select jsonb_build_object(
          'lotes',      count(*),
          'valor',      coalesce(sum(l.quantity_on_hand * l.unit_cost), 0),
          'por_vencer', count(*) filter (where l.expires_at is not null
                                           and l.expires_at <= current_date + 7))
        from public.inventory_lots l
       where l.company_id = p_company and l.status = 'disponible')
    )
  end;
$fn$;

comment on function public.informe_ventas(uuid, date, date) is
  'Ventas, margen, top clientes y productos, antigüedad de la deuda e inventario.';

revoke all on function public.informe_ventas(uuid, date, date) from public, anon;
grant execute on function public.informe_ventas(uuid, date, date) to authenticated;

commit;
