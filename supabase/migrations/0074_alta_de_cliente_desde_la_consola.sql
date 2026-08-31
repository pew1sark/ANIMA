-- 0074 · Dar de alta un cliente sin convertirse en su duenno.
--
-- El camino obvio no sirve. La politica companies_insert exige
-- created_by = auth.uid(), y el disparador on_company_created convierte a esa
-- persona en Propietario. Crear un cliente desde el navegador dejaria a SARK
-- como miembro de la empresa del cliente: exactamente lo que corrigio la 0073.
--
-- Por eso el alta pasa por aqui. La funcion crea la empresa SIN created_by, asi
-- que no nace ninguna membresia: el cliente queda registrado como cliente, y sus
-- usuarios se dan de alta despues, cuando ellos entren.

create or replace function public.crear_cliente(
  p_nombre         text,
  p_slug           text,
  p_plan           text,
  p_linea          text    default 'company',
  p_mensualidad    bigint  default null,   -- null = el precio de lista del plan
  p_implementacion bigint  default null    -- si viene, deja el cobro emitido
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $fn$
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

  if coalesce(p_implementacion, 0) > 0 then
    insert into public.platform_charges (company_id, concept, description, amount, due_date, created_by)
    values (v_company, 'implementacion', 'Puesta en marcha de ' || trim(p_nombre),
            p_implementacion, current_date + 30, (select auth.uid()));
  end if;

  insert into public.audit_logs (company_id, user_id, action, entity, entity_id, metadata)
  values (v_company, (select auth.uid()), 'ALTA_CLIENTE', 'companies', v_company::text,
          jsonb_build_object('plan', p_plan, 'linea', p_linea, 'mensualidad', v_precio,
                             'implementacion', p_implementacion));

  return v_company;
end $fn$;

revoke execute on function public.crear_cliente(text,text,text,text,bigint,bigint) from public, anon;
grant  execute on function public.crear_cliente(text,text,text,text,bigint,bigint) to authenticated;

comment on function public.crear_cliente is
  'Da de alta un cliente de la plataforma. Crea la empresa SIN created_by para que quien la registra no quede como su duenno.';
