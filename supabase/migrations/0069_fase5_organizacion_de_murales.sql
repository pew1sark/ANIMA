-- 0069 · FASE 5 · La segunda organizacion de SARK, para probar el caso completo.
--
-- El prompt maestro pide dos organizaciones bajo el mismo usuario:
--   · una de artista, en STUDIO   -> ya existe: `anima`, con 30 proyectos reales
--   · una de empresa, en COMPANY  -> es la que falta: la operacion de murales
--
-- Con las dos, el mismo usuario tiene que ver el selector al entrar, y cada
-- espacio comportarse segun su linea, su plan y sus modulos. Eso es lo que se
-- valida aqui, sin ningun otro usuario ni dato real de terceros.
--
-- La membresia de propietario NO se inserta a mano: la crea el disparador
-- on_company_created a partir de created_by.

do $$
declare
  v_user    uuid;
  v_company uuid;
  v_plan    uuid;
begin
  select id into v_user from auth.users where email = 'sarkgraff@gmail.com';
  if v_user is null then
    raise exception 'No existe el usuario sarkgraff@gmail.com en auth.users';
  end if;

  select id into v_plan from public.plans where slug = 'pro';

  -- ---------- La organizacion ----------
  insert into public.companies (name, slug, status, country, currency, timezone, locale,
                                product_line_id, tenant_type, created_by)
  values ('PEW1 · Murales', 'pew1-murales', 'active', 'CL', 'CLP',
          'America/Santiago', 'es',
          (select id from public.product_lines where slug = 'company'),
          'operator', v_user)
  on conflict (slug) do nothing;

  select id into v_company from public.companies where slug = 'pew1-murales';

  -- ---------- Su suscripcion ----------
  insert into public.subscriptions (company_id, plan_id, status, price_amount, currency, billing_cycle)
  select v_company, v_plan, 'activa', p.price_amount, p.currency, 'mensual'
  from public.plans p where p.id = v_plan
    and not exists (select 1 from public.subscriptions s where s.company_id = v_company);

  -- ---------- Que modulos quedan encendidos ----------
  -- El plan Pro deja disponibles siete. Se encienden los que un taller de
  -- murales usa de verdad; commerce y support quedan disponibles pero apagados,
  -- que es justamente la diferencia entre "esta en el plan" y "esta encendido".
  insert into public.company_modules (company_id, module_id, enabled)
  select v_company, m.id, (m.slug in ('core','creator','crm','finance','agenda'))
  from public.modules m
  join public.plan_modules pm on pm.module_id = m.id and pm.plan_id = v_plan
  on conflict (company_id, module_id) do update set enabled = excluded.enabled;
end $$;
