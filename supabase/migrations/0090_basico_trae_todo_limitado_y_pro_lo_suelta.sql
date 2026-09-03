begin;

-- ---------------------------------------------------------------------------
-- COMPANY deja de diferenciarse por módulos y pasa a diferenciarse por límites
-- ---------------------------------------------------------------------------
-- Hasta ahora el Básico traía cuatro módulos y los otros seis estaban apagados:
-- una empresa chica compraba un sistema mutilado y descubría la mitad del
-- producto solo si subía de plan. La oferta nueva es al revés — los tres planes
-- traen los diez módulos base, y lo que cambia es hasta dónde llegan.
--
-- Esto no necesita estructura nueva: `plan_modules.max_tier` existe desde la
-- migración 0061 justamente para esto (basico | avanzado | enterprise). Lo que
-- faltaba era usarlo.
--
--   Básico      los diez módulos, tier 'basico'      → con topes de volumen
--   Pro         los diez módulos, tier 'avanzado'    → sin topes
--   Enterprise  los once (con IA), tier 'enterprise' → sin topes y multiempresa

-- 1 · El Básico recibe los seis módulos que le faltaban.
insert into public.plan_modules (plan_id, module_id, max_tier)
select p.id, m.id, 'basico'::public.module_tier
  from public.plans p
  join public.modules m
    on m.slug in ('commerce','operations','delivery','food','creator','finance')
 where p.slug = 'starter'
   and not exists (select 1 from public.plan_modules pm
                    where pm.plan_id = p.id and pm.module_id = m.id);

-- 2 · Cada plan deja su nivel escrito. Antes estaban todos en el valor por
--     defecto, o sea el nivel no decía nada de nadie.
update public.plan_modules pm set max_tier = 'basico'
  from public.plans p where p.id = pm.plan_id and p.slug = 'starter';

update public.plan_modules pm set max_tier = 'avanzado'
  from public.plans p where p.id = pm.plan_id and p.slug = 'business';

update public.plan_modules pm set max_tier = 'enterprise'
  from public.plans p where p.id = pm.plan_id and p.slug = 'enterprise';

-- 3 · Las empresas vivas heredan el nivel de su plan, para que el dato diga la
--     verdad el día que la aplicación empiece a leerlo.
update public.company_modules cm
   set tier = pm.max_tier
  from public.subscriptions s
  join public.plan_modules pm on pm.plan_id = s.plan_id
 where cm.company_id = s.company_id
   and cm.module_id = pm.module_id
   and s.status = 'activa'
   and cm.tier is distinct from pm.max_tier;

-- 4 · Los límites, escritos como dato y no solo como texto de una página.
--     `features` es jsonb y estaba vacío en todos los planes. Aquí viven los
--     topes que la aplicación tendrá que respetar cuando se implementen: hoy
--     NO se aplican solos — la cuota es un compromiso comercial, todavía no
--     una barrera del software.
update public.plans set features = jsonb_build_object(
  'limites', jsonb_build_object('clientes', 500, 'productos', 500,
                                'documentos_mes', 500, 'bodegas', 1, 'archivo_gb', 2),
  'addons', false, 'desarrollo_a_medida', false, 'implementacion_datos', false
) where slug = 'starter';

update public.plans set features = jsonb_build_object(
  'limites', jsonb_build_object('clientes', null, 'productos', null,
                                'documentos_mes', null, 'bodegas', null, 'archivo_gb', 20),
  'addons', true, 'desarrollo_a_medida', true, 'implementacion_datos', 'add-on'
) where slug = 'business';

update public.plans set features = jsonb_build_object(
  'limites', jsonb_build_object('clientes', null, 'productos', null,
                                'documentos_mes', null, 'bodegas', null, 'archivo_gb', null),
  'addons', true, 'desarrollo_a_medida', true, 'implementacion_datos', true,
  'multiempresa', true, 'multioperador', true
) where slug = 'enterprise';

-- STUDIO conserva su escalera de módulos; solo se anota dónde se cuelgan cosas.
update public.plans set features = jsonb_build_object('addons', false, 'desarrollo_a_medida', false)
 where slug = 'studio_solo';
update public.plans set features = jsonb_build_object('addons', true, 'desarrollo_a_medida', true)
 where slug in ('studio_taller','studio_clan');

commit;
