-- ===========================================================================
-- 0086 · La consola pasa a vigilar, no a cobrar
-- ===========================================================================
-- La consola había quedado como un libro de cuentas: ingreso mensual, por
-- cobrar, vencidos, un formulario para emitir cobros. Ese no es su trabajo.
--
-- La consola es el centro de control de ANIMA TSC: mira el ESTADO de cada
-- cliente —si entra, si usa, si le queda cupo, si su plan le sirve— y nada
-- más. La relación comercial con un cliente vive en ANIMA COMPANY, junto a
-- todos los demás clientes y con las mismas herramientas: ahí ya existen la
-- ficha, los documentos, los vencimientos y los pagos, y no hay ninguna razón
-- para tener una segunda contabilidad paralela que solo sirva para un cliente.
--
-- `estado_clientes()` responde lo que sí es de aquí:
--
--   ¿entra alguien?      usuarios activos y cuánto permite el plan
--   ¿usa de verdad?      última actividad y acciones de los últimos 7 días
--   ¿tiene datos?        clientes, productos y pedidos cargados
--   ¿le sirve el plan?   módulos encendidos contra los que su plan incluye
--   ¿arrancó?            en qué va la puesta en marcha
--
-- Ninguna cifra de dinero. Solo lee, y solo para quien administra la
-- plataforma: `is_platform_admin()`.
-- ===========================================================================

create or replace function public.estado_clientes()
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select case when not public.is_platform_admin() then '[]'::jsonb else
    coalesce((
      select jsonb_agg(x order by x->>'empresa')
        from (
          select jsonb_build_object(
            'company_id', c.id,
            'empresa',    c.name,
            'slug',       c.slug,
            'estado',     c.status,
            'linea',      pl.name,
            'linea_slug', pl.slug,
            'plan',       p.name,
            'suscripcion', s.status::text,
            'desde',      s.started_at,

            -- ¿entra alguien?
            'usuarios', (select count(*) from company_members m
                          where m.company_id = c.id and m.status = 'active'),
            'usuarios_plan', p.max_users,

            -- ¿usa de verdad? La auditoría solo registra lo que tiene impacto
            -- económico o de estado: si ahí no hay nada, no se está operando.
            'ultima_actividad', (select max(a.created_at) from audit_logs a where a.company_id = c.id),
            'acciones_7d', (select count(*) from audit_logs a
                             where a.company_id = c.id and a.created_at >= now() - interval '7 days'),

            -- ¿tiene datos dentro? Distingue un cliente que arrancó de uno que
            -- solo tiene la cuenta abierta.
            'datos', jsonb_build_object(
              'clientes',  (select count(*) from customers cu where cu.company_id = c.id),
              'productos', (select count(*) from products pr where pr.company_id = c.id),
              'pedidos',   (select count(*) from orders o where o.company_id = c.id),
              'pedidos_30d', (select count(*) from orders o
                               where o.company_id = c.id and o.order_date >= now() - interval '30 days')),

            -- ¿le sirve el plan? Un módulo encendido que el plan no incluye es
            -- una promesa que la base no va a cumplir.
            'modulos', (select count(*) from company_modules cm
                         where cm.company_id = c.id and cm.enabled),
            'modulos_plan', (select count(*) from plan_modules pm where pm.plan_id = p.id),
            'fuera_del_plan', (select count(*) from company_modules cm
                                where cm.company_id = c.id and cm.enabled
                                  and not exists (select 1 from plan_modules pm
                                                   where pm.plan_id = p.id and pm.module_id = cm.module_id)),

            -- ¿arrancó?
            -- Sin sesión de levantamiento la subconsulta no devuelve fila,
            -- no 'sin abrir': el coalesce va fuera, no dentro del case.
            'levantamiento', coalesce((
              select case when ss.applied_at is not null then 'aplicado'
                          when ss.submitted_at is not null then 'enviado'
                          else 'abierto' end
                from survey_sessions ss
               where ss.company_id = c.id
               order by ss.created_at desc limit 1), 'sin abrir')
          ) as x
          from companies c
          left join subscriptions s on s.company_id = c.id
          left join plans p on p.id = s.plan_id
          left join product_lines pl on pl.id = p.product_line_id
        ) t), '[]'::jsonb)
  end;
$$;

comment on function public.estado_clientes() is
  'Estado de cada cliente de la plataforma: acceso, uso, datos, plan y puesta en marcha. Sin cifras de dinero — eso vive en ANIMA COMPANY. Solo lectura, solo platform admin.';

revoke all on function public.estado_clientes() from public, anon;
grant execute on function public.estado_clientes() to authenticated;


-- ---------------------------------------------------------------------------
-- El alta deja de emitir cobros
-- ---------------------------------------------------------------------------
-- `crear_cliente` insertaba un `platform_charges` de implementación cuando se
-- le pasaba un monto. Con la consola fuera del dinero, ese cobro nacía en una
-- pantalla que ya no lo muestra: quedaría escrito y invisible, que es peor que
-- no escribirlo.
--
-- La implementación se cobra donde se cobra todo lo demás: como documento del
-- cliente dentro de ANIMA COMPANY. Aquí se da de alta la cuenta y se deja
-- encendido lo que trae el plan; nada más.
--
-- `p_mensualidad` sí se queda: no es un cobro, es el precio pactado de la
-- suscripción, y eso sí es estado de la plataforma.

drop function if exists public.crear_cliente(text, text, text, text, bigint, bigint);

create or replace function public.crear_cliente(
  p_nombre text, p_slug text, p_plan text,
  p_linea text default 'company', p_mensualidad bigint default null)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_company uuid; v_plan public.plans; v_linea uuid; v_precio bigint;
begin
  if not public.is_platform_admin() then
    raise exception 'Solo la plataforma da de alta clientes';
  end if;

  if coalesce(trim(p_nombre),'') = '' then raise exception 'El cliente necesita un nombre'; end if;
  if p_slug !~ '^[a-z][a-z0-9-]{1,38}$' then
    raise exception 'El identificador debe ser minusculas, numeros y guiones: "%"', p_slug;
  end if;
  if exists (select 1 from public.companies where slug = p_slug) then
    raise exception 'Ya existe un cliente con el identificador "%"', p_slug;
  end if;

  select * into v_plan from public.plans where slug = p_plan and active;
  if v_plan.id is null then raise exception 'No existe el plan "%"', p_plan; end if;

  select id into v_linea from public.product_lines where slug = p_linea and active;
  if v_linea is null then raise exception 'No existe la linea "%"', p_linea; end if;

  v_precio := coalesce(p_mensualidad, v_plan.price_amount);

  -- created_by va en null a proposito: sin eso, el disparador haria miembro a
  -- quien la crea. La empresa nace sin duenno hasta que el cliente entre.
  insert into public.companies (name, slug, status, country, currency, timezone, locale,
                                product_line_id, tenant_type, created_by)
  values (trim(p_nombre), p_slug, 'trial', 'CL', 'CLP', 'America/Santiago', 'es',
          v_linea, 'operator', null)
  returning id into v_company;

  insert into public.subscriptions (company_id, plan_id, status, price_amount, currency, billing_cycle,
                                    trial_ends_at)
  values (v_company, v_plan.id, 'prueba', v_precio, 'CLP', 'mensual',
          case when v_plan.trial_days > 0 then now() + (v_plan.trial_days || ' days')::interval end);

  -- Todo lo que trae su plan queda encendido; despues se apaga lo que no use.
  insert into public.company_modules (company_id, module_id, enabled)
  select v_company, pm.module_id, true
  from public.plan_modules pm where pm.plan_id = v_plan.id
  on conflict (company_id, module_id) do nothing;

  insert into public.audit_logs (company_id, user_id, action, entity, entity_id, metadata)
  values (v_company, (select auth.uid()), 'ALTA_CLIENTE', 'companies', v_company::text,
          jsonb_build_object('plan', p_plan, 'linea', p_linea, 'mensualidad', v_precio));

  return v_company;
end $$;

revoke all on function public.crear_cliente(text, text, text, text, bigint) from public, anon;
grant execute on function public.crear_cliente(text, text, text, text, bigint) to authenticated;
