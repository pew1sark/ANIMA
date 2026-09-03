begin;

-- ---------------------------------------------------------------------------
-- STUDIO se ordena igual que COMPANY: todo incluido, lo que cambia es el techo
-- ---------------------------------------------------------------------------
-- El Starter traía tres módulos de siete; el Pro, cinco. Igual que en COMPANY,
-- eso vendía un taller mutilado. Ahora los tres planes traen el Taller entero
-- —proyectos, tareas, clientes, cotizador, finanzas, agenda y portafolio— y lo
-- que cambia es cuánta gente, cuánto volumen y qué se les puede colgar encima.
--
--   Starter  1 persona  · 20 proyectos, 100 clientes, 30 cotizaciones/mes · 1 GB
--   Pro      hasta 3    · sin topes · 15 GB · Clan · add-ons
--   Max      hasta 10   · sin topes · 50 GB · Clan + Santuario · IA · datos
--
-- Ojo con lo que esta migración NO decide: el Taller que corre en home.html no
-- lee esta tabla, sino `almas.plan` (ALMA / CLAN / SANTUARIO) y sus propias
-- constantes. Las cuotas de archivo que ese código sí aplica se actualizaron en
-- assets/js/seed.js con exactamente estos números.

-- 1 · Los siete módulos base en los tres planes de STUDIO.
insert into public.plan_modules (plan_id, module_id, max_tier)
select p.id, m.id, 'basico'::public.module_tier
  from public.plans p
  join public.modules m
    on m.slug in ('core','creator','agenda','crm','finance','commerce','support')
 where p.slug in ('studio_solo','studio_taller','studio_clan')
   and not exists (select 1 from public.plan_modules pm
                    where pm.plan_id = p.id and pm.module_id = m.id);

-- 2 · El Max suma IA, como el Enterprise de COMPANY.
insert into public.plan_modules (plan_id, module_id, max_tier)
select p.id, m.id, 'enterprise'::public.module_tier
  from public.plans p join public.modules m on m.slug = 'ai'
 where p.slug = 'studio_clan'
   and not exists (select 1 from public.plan_modules pm
                    where pm.plan_id = p.id and pm.module_id = m.id);

-- 3 · El nivel de cada plan, que hasta ahora estaba en el valor por defecto.
update public.plan_modules pm set max_tier = 'basico'
  from public.plans p where p.id = pm.plan_id and p.slug = 'studio_solo';
update public.plan_modules pm set max_tier = 'avanzado'
  from public.plans p where p.id = pm.plan_id and p.slug = 'studio_taller';
update public.plan_modules pm set max_tier = 'enterprise'
  from public.plans p where p.id = pm.plan_id and p.slug = 'studio_clan';

-- 4 · Las empresas de STUDIO heredan el nivel de su plan.
update public.company_modules cm
   set tier = pm.max_tier
  from public.subscriptions s
  join public.plan_modules pm on pm.plan_id = s.plan_id
 where cm.company_id = s.company_id
   and cm.module_id = pm.module_id
   and s.status = 'activa'
   and cm.tier is distinct from pm.max_tier;

-- 5 · Los topes, escritos como dato. Los de archivo los aplica el Taller hoy;
--     los de volumen son compromiso comercial hasta que alguien los programe.
update public.plans set features = jsonb_build_object(
  'plan_studio', 'ALMA',
  'limites', jsonb_build_object('proyectos_activos', 20, 'clientes', 100,
                                'cotizaciones_mes', 30, 'archivo_gb', 1,
                                'imagenes', 60, 'pdfs', 12),
  'addons', false, 'desarrollo_a_medida', false, 'implementacion_datos', false
) where slug = 'studio_solo';

update public.plans set features = jsonb_build_object(
  'plan_studio', 'CLAN',
  'limites', jsonb_build_object('proyectos_activos', null, 'clientes', null,
                                'cotizaciones_mes', null, 'archivo_gb', 15,
                                'imagenes', 400, 'pdfs', 80),
  'clan', true,
  'addons', true, 'desarrollo_a_medida', true, 'implementacion_datos', 'add-on'
) where slug = 'studio_taller';

update public.plans set features = jsonb_build_object(
  'plan_studio', 'SANTUARIO',
  'limites', jsonb_build_object('proyectos_activos', null, 'clientes', null,
                                'cotizaciones_mes', null, 'archivo_gb', 50,
                                'imagenes', 1500, 'pdfs', 300),
  'clan', true, 'santuario', true,
  'addons', true, 'desarrollo_a_medida', true, 'implementacion_datos', true
) where slug = 'studio_clan';

commit;
