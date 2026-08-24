-- ===========================================================
-- 0050 · CAPA DE COMPATIBILIDAD
-- Las 62 funciones de JLIZ dependen de cuatro helpers: auth_role(),
-- is_admin(), is_authenticated() y has_perm(). Todos leen profiles.role.
--
-- La plataforma tiene roles JERÁRQUICOS (owner 100 … viewer 20). JLIZ tiene
-- roles FUNCIONALES (ventas, compras, reparto…). No son lo mismo y no hay que
-- forzarlos: se guardan los dos. El nivel decide cuánto puede; el rol
-- funcional, en qué área. Con estos equivalentes, las funciones de negocio
-- portan casi verbatim.
-- ===========================================================

alter table public.company_members add column if not exists job_role public.app_role;
comment on column public.company_members.job_role is 'Rol funcional (área). Convive con el nivel jerárquico del role_id.';

create table if not exists public.company_role_permissions (
  company_id uuid not null references public.companies(id) on delete cascade,
  job_role public.app_role not null,
  resource text not null, action text not null,
  enabled boolean not null default true,
  primary key (company_id, job_role, resource, action)
);
create index if not exists crp_company_idx on public.company_role_permissions(company_id);
alter table public.company_role_permissions enable row level security;
drop policy if exists crp_read on public.company_role_permissions;
create policy crp_read on public.company_role_permissions for select to authenticated
  using (public.is_company_member(company_id) or public.is_platform_admin());
drop policy if exists crp_write on public.company_role_permissions;
create policy crp_write on public.company_role_permissions for all to authenticated
  using (public.has_company_level(company_id, 80)) with check (public.has_company_level(company_id, 80));

-- Empresa activa de la sesión. El frontend la fija con:
--   select set_config('app.company_id', '<uuid>', false)
create or replace function public.current_company()
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    nullif(current_setting('app.company_id', true), '')::uuid,
    (select cm.company_id from public.company_members cm
      where cm.user_id = (select auth.uid()) and cm.status = 'active'
      order by cm.created_at asc limit 1));
$$;

create or replace function public.auth_role()
returns public.app_role language sql stable security definer set search_path = public, pg_temp as $$
  select cm.job_role from public.company_members cm
  where cm.user_id = (select auth.uid())
    and cm.company_id = public.current_company() and cm.status = 'active' limit 1;
$$;

create or replace function public.is_authenticated()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.company_members cm
                 where cm.user_id = (select auth.uid()) and cm.status = 'active');
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_platform_admin()
      or public.has_company_level(public.current_company(), 80)
      or coalesce(public.auth_role() = 'admin', false);
$$;

create or replace function public.has_perm(_resource text, _action text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_admin() or exists (
    select 1 from public.company_role_permissions rp
    where rp.company_id = public.current_company() and rp.job_role = public.auth_role()
      and rp.resource = _resource and rp.action = _action and rp.enabled);
$$;

revoke execute on function public.current_company()   from public, anon;
revoke execute on function public.auth_role()         from public, anon;
revoke execute on function public.is_authenticated()  from public, anon;
revoke execute on function public.is_admin()          from public, anon;
revoke execute on function public.has_perm(text,text) from public, anon;
grant execute on function public.current_company()    to authenticated;
grant execute on function public.auth_role()          to authenticated;
grant execute on function public.is_authenticated()   to authenticated;
grant execute on function public.is_admin()           to authenticated;
grant execute on function public.has_perm(text,text)  to authenticated;

-- Recálculos: son SECURITY DEFINER (escriben totales), así que comprueban
-- explícitamente que quien llama pertenece a la empresa de la fila.
create or replace function public.recalc_order_totals(_order_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_sub numeric(14,2); v_cost numeric(14,2); v_company uuid;
begin
  select company_id into v_company from public.orders where id = _order_id;
  if v_company is null or not public.has_company_level(v_company, 40) then
    raise exception 'Sin acceso a ese pedido';
  end if;
  select coalesce(sum(line_total),0),
         coalesce(sum(coalesce(quantity_prepared, quantity_ordered) * unit_cost),0)
    into v_sub, v_cost from public.order_items where order_id = _order_id;
  update public.orders set subtotal = v_sub, cost_total = v_cost,
         total = v_sub - discount + freight where id = _order_id;
end $$;

create or replace function public.recalc_purchase_totals(_purchase_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_sub numeric(14,2); v_company uuid;
begin
  select company_id into v_company from public.purchases where id = _purchase_id;
  if v_company is null or not public.has_company_level(v_company, 60) then
    raise exception 'Sin acceso a esa compra';
  end if;
  select coalesce(sum(line_total),0) into v_sub
    from public.purchase_items where purchase_id = _purchase_id;
  update public.purchases set subtotal = v_sub,
         total = v_sub + freight_cost + other_costs where id = _purchase_id;
end $$;
revoke execute on function public.recalc_order_totals(uuid)    from public, anon;
revoke execute on function public.recalc_purchase_totals(uuid) from public, anon;
grant execute on function public.recalc_order_totals(uuid)     to authenticated;
grant execute on function public.recalc_purchase_totals(uuid)  to authenticated;

-- Totales automáticos al tocar las líneas
create or replace function public.trg_order_items_totals()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_sub numeric(14,2); v_cost numeric(14,2); v_order uuid;
begin
  v_order := coalesce(new.order_id, old.order_id);
  select coalesce(sum(line_total),0),
         coalesce(sum(coalesce(quantity_prepared, quantity_ordered) * unit_cost),0)
    into v_sub, v_cost from public.order_items where order_id = v_order;
  update public.orders set subtotal = v_sub, cost_total = v_cost,
         total = v_sub - discount + freight where id = v_order;
  return coalesce(new, old);
end $$;
create or replace function public.trg_purchase_items_totals()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_sub numeric(14,2); v_purchase uuid;
begin
  v_purchase := coalesce(new.purchase_id, old.purchase_id);
  select coalesce(sum(line_total),0) into v_sub
    from public.purchase_items where purchase_id = v_purchase;
  update public.purchases set subtotal = v_sub,
         total = v_sub + freight_cost + other_costs where id = v_purchase;
  return coalesce(new, old);
end $$;
revoke execute on function public.trg_order_items_totals()    from public, anon, authenticated;
revoke execute on function public.trg_purchase_items_totals() from public, anon, authenticated;
drop trigger if exists order_items_totals on public.order_items;
create trigger order_items_totals after insert or update or delete on public.order_items
  for each row execute function public.trg_order_items_totals();
drop trigger if exists purchase_items_totals on public.purchase_items;
create trigger purchase_items_totals after insert or update or delete on public.purchase_items
  for each row execute function public.trg_purchase_items_totals();

-- Historial de estados del pedido
create or replace function public.trg_order_status_history()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.order_status_history (company_id, order_id, from_status, to_status, changed_by)
    values (new.company_id, new.id, old.status, new.status, (select auth.uid()));
  elsif tg_op = 'INSERT' then
    insert into public.order_status_history (company_id, order_id, from_status, to_status, changed_by)
    values (new.company_id, new.id, null, new.status, (select auth.uid()));
  end if;
  return new;
end $$;
revoke execute on function public.trg_order_status_history() from public, anon, authenticated;
drop trigger if exists orders_status_history on public.orders;
create trigger orders_status_history after insert or update on public.orders
  for each row execute function public.trg_order_status_history();

update public.company_members set job_role = 'admin'
where job_role is null and role_id in (select id from public.roles where slug in ('owner','admin'));
