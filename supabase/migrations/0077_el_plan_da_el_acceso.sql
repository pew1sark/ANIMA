-- 0077 — El plan decide a qué sub-plataforma se entra
--
-- Hasta ahora la línea vivía en `companies.product_line_id` y el plan la
-- repetía por su lado. Dos fuentes para el mismo hecho: la 0070 ya tuvo que
-- arreglar una organización que estaba en STUDIO con un plan de COMPANY.
--
-- Desde aquí manda el plan. La columna de la empresa sigue existiendo —la leen
-- `mi_espacio` y media aplicación— pero pasa a ser un espejo que un trigger
-- mantiene al día. Una sola verdad, escrita en un solo lugar.

begin;

-- ---------------------------------------------------------------------------
-- 1. La línea de la empresa la fija su plan
-- ---------------------------------------------------------------------------

create or replace function public.suscripcion_fija_la_linea()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_linea uuid;
begin
  select product_line_id into v_linea from public.plans where id = new.plan_id;

  -- Un plan sin línea no dice nada: se deja la empresa como está.
  if v_linea is null then
    return new;
  end if;

  update public.companies
     set product_line_id = v_linea
   where id = new.company_id
     and product_line_id is distinct from v_linea;

  return new;
end;
$fn$;

comment on function public.suscripcion_fija_la_linea() is
  'Mantiene companies.product_line_id como espejo de la línea del plan contratado.';

drop trigger if exists trg_suscripcion_fija_la_linea on public.subscriptions;
create trigger trg_suscripcion_fija_la_linea
  after insert or update of plan_id on public.subscriptions
  for each row execute function public.suscripcion_fija_la_linea();

-- Alinea lo que ya existe. Hoy las tres coinciden; esto lo deja garantizado.
update public.companies c
   set product_line_id = p.product_line_id
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
 where s.company_id = c.id
   and p.product_line_id is not null
   and c.product_line_id is distinct from p.product_line_id;

-- ---------------------------------------------------------------------------
-- 2. Qué puertas se le abren a quien entra
-- ---------------------------------------------------------------------------

create or replace function public.mis_lineas()
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select coalesce(array_agg(distinct linea), '{}'::text[])
    from (
      -- Lo que habilita el plan de cada organización donde eres miembro.
      -- `morosa` sigue abriendo: cortarle el acceso a quien debe es una
      -- decisión comercial, no algo que deba pasar solo.
      select pl.slug as linea
        from public.company_members m
        join public.companies    c  on c.id  = m.company_id
        join public.subscriptions s on s.company_id = c.id
        join public.plans        p  on p.id  = s.plan_id
        join public.product_lines pl on pl.id = p.product_line_id
       where m.user_id = (select auth.uid())
         and m.status  = 'active'
         and s.status in ('prueba', 'activa', 'morosa')
         and pl.active

      union

      -- El Alma es la entrada gratuita a STUDIO. Las 22 de la Alpha no tienen
      -- organización ni plan, y aun así ahí es donde viven.
      select 'studio'
        from public.almas a
       where a.user_id = (select auth.uid())
    ) t;
$fn$;

comment on function public.mis_lineas() is
  'Sub-plataformas a las que puede entrar el usuario actual: las de sus planes, más STUDIO si tiene Alma.';

revoke all on function public.mis_lineas() from public, anon;
grant execute on function public.mis_lineas() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. La cartera también monitorea usuarios
-- ---------------------------------------------------------------------------
-- La consola es para vigilar la relación comercial: usuarios, plan y pagos.
-- Faltaban los usuarios.

-- `create or replace view` no admite insertar una columna en medio; hay que
-- rehacerla. No la usa ninguna otra vista.
drop view if exists public.v_cartera_plataforma;

create view public.v_cartera_plataforma
with (security_invoker = true) as
select c.id                                as company_id,
       c.name                              as empresa,
       c.slug,
       c.status                            as estado_empresa,
       pl.name                             as linea,
       p.name                              as plan,
       s.status                            as suscripcion,
       s.price_amount                      as mensualidad,
       coalesce(mb.usuarios, 0)            as usuarios,
       p.max_users                         as usuarios_del_plan,
       coalesce(ch.cobrado, 0)             as total_cobrado,
       coalesce(ch.pagado, 0)              as total_pagado,
       coalesce(ch.cobrado, 0) - coalesce(ch.pagado, 0) as saldo,
       ch.vencidos
  from public.companies c
  left join public.product_lines pl on pl.id = c.product_line_id
  left join public.subscriptions s  on s.company_id = c.id
  left join public.plans p          on p.id = s.plan_id
  left join lateral (
        select count(*) as usuarios
          from public.company_members m
         where m.company_id = c.id and m.status = 'active'
       ) mb on true
  left join lateral (
        select sum(x.amount) as cobrado,
               sum(coalesce((select sum(pp.amount) from public.platform_payments pp
                              where pp.charge_id = x.id), 0)) as pagado,
               count(*) filter (where x.status = 'pendiente' and x.due_date < current_date) as vencidos
          from public.platform_charges x
         where x.company_id = c.id and x.status <> 'anulado'
       ) ch on true;

comment on view public.v_cartera_plataforma is
  'Una fila por cliente del software: su plan, cuántos usuarios tiene y cómo va de pagos. Nada de su operación.';

-- Es información comercial: no tiene por qué estar al alcance de una sesión anónima.
grant select on public.v_cartera_plataforma to authenticated, service_role;
revoke all on public.v_cartera_plataforma from anon;

commit;
