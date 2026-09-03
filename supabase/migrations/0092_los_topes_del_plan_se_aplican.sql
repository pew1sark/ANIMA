begin;

-- ---------------------------------------------------------------------------
-- Los topes del plan dejan de ser una promesa de la página
-- ---------------------------------------------------------------------------
-- Las migraciones 0090 y 0091 escribieron los límites en `plans.features`, pero
-- no los aplicaba nadie: una organización en Básico podía cargar cinco mil
-- clientes y el sistema la dejaba. Un tope que solo existe en una página de
-- precios no es un tope, es una frase.
--
-- Se aplica donde se aplica el aislamiento —en la base, no en la aplicación—,
-- por la misma razón: si vive en el cliente, cualquier pantalla nueva que
-- olvide preguntarlo lo salta sin que nadie se entere.
--
-- Vale para las dos plataformas: las tablas del Taller de STUDIO (projects,
-- clients, quotes) también cuelgan de company_id, así que el mismo guardián
-- sirve para las dos.

-- ---------------------------------------------------------------- el tope
-- Devuelve el tope del plan contratado para una clave. NULL = sin tope, que es
-- lo que tienen Pro, Max y Enterprise: la ausencia de límite se dice callando.
create or replace function public.tope_del_plan(p_company uuid, p_clave text)
returns bigint
language sql stable security definer set search_path to 'public','pg_temp'
as $$
  select case
           when p_clave = 'personas' then p.max_users::bigint
           else nullif(p.features->'limites'->>p_clave, '')::bigint
         end
    from public.subscriptions s
    join public.plans p on p.id = s.plan_id
   where s.company_id = p_company
     and s.status in ('prueba','activa','morosa')
   order by case s.status when 'activa' then 1 when 'prueba' then 2 else 3 end
   limit 1
$$;

comment on function public.tope_del_plan(uuid, text) is
  'Tope del plan contratado para una clave de cuota. NULL = sin tope.';

-- ---------------------------------------------------------------- el uso
create or replace function public.uso_del_plan(p_company uuid, p_clave text)
returns bigint
language plpgsql stable security definer set search_path to 'public','pg_temp'
as $$
declare n bigint := 0;
begin
  if p_clave = 'personas' then
    select count(*) into n from public.company_members
     where company_id = p_company and status <> 'suspended';

  elsif p_clave = 'clientes' then
    -- COMPANY los guarda en `customers` y el Taller de STUDIO en `clients`.
    -- Una organización vive en una sola de las dos, así que sumar es seguro.
    select (select count(*) from public.customers where company_id = p_company)
         + (select count(*) from public.clients   where company_id = p_company)
      into n;

  elsif p_clave = 'productos' then
    select count(*) into n from public.products where company_id = p_company;

  elsif p_clave = 'documentos_mes' then
    select count(*) into n from public.orders
     where company_id = p_company and created_at >= date_trunc('month', now());

  elsif p_clave = 'bodegas' then
    -- `locations` guarda bodegas y también vehículos; el tope es de bodegas.
    select count(*) into n from public.locations
     where company_id = p_company and coalesce(type,'') <> 'vehiculo';

  elsif p_clave = 'proyectos_activos' then
    select count(*) into n from public.projects
     where company_id = p_company
       and coalesce(archive,'') = ''
       and coalesce(status,'') <> 'Cerrado';

  elsif p_clave = 'cotizaciones_mes' then
    select count(*) into n from public.quotes
     where company_id = p_company and created_at >= date_trunc('month', now());
  end if;

  return coalesce(n, 0);
end $$;

comment on function public.uso_del_plan(uuid, text) is
  'Cuánto lleva usado una organización de una cuota. Cuenta en las tablas de las dos plataformas.';

-- ---------------------------------------------------------------- el guardián
-- Un solo disparador para todas las tablas. La clave y el nombre en castellano
-- llegan como argumentos, así que agregar una cuota nueva es una línea, no una
-- función nueva.
create or replace function public.exigir_cupo()
returns trigger
language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare
  v_clave  text := TG_ARGV[0];
  v_nombre text := TG_ARGV[1];
  v_tope   bigint;
  v_uso    bigint;
begin
  if NEW.company_id is null then return NEW; end if;

  v_tope := public.tope_del_plan(NEW.company_id, v_clave);
  if v_tope is null then return NEW; end if;      -- plan sin tope: pasa de largo

  v_uso := public.uso_del_plan(NEW.company_id, v_clave);
  if v_uso >= v_tope then
    -- El mensaje se escribe para que se pueda mostrar tal cual: si alguna
    -- pantalla no lo traduce, lo que ve la persona igual se entiende.
    raise exception 'Tu plan incluye hasta % % y ya los tienes. Subir de plan levanta el tope sin migrar nada.',
                    v_tope, v_nombre
      using errcode = '45000',
            detail  = format('cuota=%s;tope=%s;uso=%s', v_clave, v_tope, v_uso),
            hint    = 'CUPO_AGOTADO';
  end if;

  return NEW;
end $$;

comment on function public.exigir_cupo() is
  'Disparador de cuota. Argumentos: clave de la cuota y su nombre en castellano. Lanza 45000 al llegar al tope.';

-- ---------------------------------------------------------------- los puestos
drop trigger if exists cupo_clientes      on public.customers;
create trigger cupo_clientes      before insert on public.customers
  for each row execute function public.exigir_cupo('clientes','clientes');

drop trigger if exists cupo_clientes      on public.clients;
create trigger cupo_clientes      before insert on public.clients
  for each row execute function public.exigir_cupo('clientes','clientes');

drop trigger if exists cupo_productos     on public.products;
create trigger cupo_productos     before insert on public.products
  for each row execute function public.exigir_cupo('productos','productos');

drop trigger if exists cupo_documentos    on public.orders;
create trigger cupo_documentos    before insert on public.orders
  for each row execute function public.exigir_cupo('documentos_mes','documentos en el mes');

drop trigger if exists cupo_bodegas       on public.locations;
create trigger cupo_bodegas       before insert on public.locations
  for each row execute function public.exigir_cupo('bodegas','bodegas');

drop trigger if exists cupo_proyectos     on public.projects;
create trigger cupo_proyectos     before insert on public.projects
  for each row execute function public.exigir_cupo('proyectos_activos','proyectos activos');

drop trigger if exists cupo_cotizaciones  on public.quotes;
create trigger cupo_cotizaciones  before insert on public.quotes
  for each row execute function public.exigir_cupo('cotizaciones_mes','cotizaciones en el mes');

drop trigger if exists cupo_personas      on public.company_members;
create trigger cupo_personas      before insert on public.company_members
  for each row execute function public.exigir_cupo('personas','personas');

-- ---------------------------------------------------------------- la vitrina
-- Lo que necesita una pantalla para avisar ANTES de que se llene: uso, tope y
-- el porcentaje. Solo devuelve las cuotas que existen para ese plan.
create or replace function public.cuotas(p_company uuid default null)
returns table(clave text, etiqueta text, uso bigint, tope bigint, pct int)
language plpgsql stable security definer set search_path to 'public','pg_temp'
as $$
declare c uuid := coalesce(p_company, public.current_company());
begin
  if c is null then return; end if;
  if not (public.is_company_member(c) or public.is_platform_admin()) then
    raise exception 'Sin acceso a esa organización' using errcode = '42501';
  end if;

  return query
  select k.clave, k.etiqueta,
         public.uso_del_plan(c, k.clave)  as uso,
         public.tope_del_plan(c, k.clave) as tope,
         case when public.tope_del_plan(c, k.clave) is null or public.tope_del_plan(c, k.clave) = 0
              then 0
              else least(100, (public.uso_del_plan(c, k.clave) * 100
                               / public.tope_del_plan(c, k.clave))::int)
         end as pct
    from (values
      ('personas',          'Personas'),
      ('clientes',          'Clientes'),
      ('productos',         'Productos'),
      ('documentos_mes',    'Documentos del mes'),
      ('bodegas',           'Bodegas'),
      ('proyectos_activos', 'Proyectos activos'),
      ('cotizaciones_mes',  'Cotizaciones del mes')
    ) as k(clave, etiqueta)
   where public.tope_del_plan(c, k.clave) is not null;
end $$;

comment on function public.cuotas(uuid) is
  'Uso y tope de cada cuota de la organización. Solo las cuotas que su plan limita.';

-- Solo `cuotas()` sale a la luz, porque es la única que comprueba que quien
-- pregunta pertenezca a la organización. `uso_del_plan` cuenta filas de una
-- empresa cualquiera: expuesta a `authenticated`, sería una forma educada de
-- contarle a un cliente cuántos clientes tiene otro. Las llaman el disparador y
-- `cuotas()`, que son SECURITY DEFINER y corren como su dueño.
revoke execute on function public.tope_del_plan(uuid, text) from authenticated, anon, public;
revoke execute on function public.uso_del_plan(uuid, text)  from authenticated, anon, public;
grant  execute on function public.cuotas(uuid) to authenticated;

commit;
