-- ===========================================================
-- 0121 · REAL ESTATE INTELLIGENCE — permisos, borrado lógico y registro
-- -----------------------------------------------------------
-- Tres cosas que van juntas porque se explican juntas.
--
-- 1 · QUIÉN VE QUÉ. Aquí el corte es por EMPRESA y no por proyecto, y
--     la diferencia con Capital Intelligence es deliberada, no una
--     simplificación:
--
--       · En CI existe `ci_project_members` porque hay un caso real de
--         alguien que entra a la organización del asesor para ver UN
--         proyecto y nada más: el inversionista al que se le abrió una
--         carpeta.
--       · Aquí no lo hay. El inventario, la demanda y los comparables
--         de precio/m² son de la organización entera —es justamente el
--         cruce entre todos lo que produce la información— y partirlos
--         por desarrollo dejaría un scoring calculado sobre la mitad
--         de los datos, que es peor que no calcularlo.
--
--     Cuando un desarrollo necesita abrirse a un tercero, lo hace por
--     el puente: `rei_developments.ci_project_id` apunta a un proyecto
--     de CI, y allá el invitado ve su modelo, su ronda y su cap table
--     sin que eso le abra el CRM de la inmobiliaria.
--
--     Los umbrales, en la escala de roles de la plataforma:
--       40 · leer         — el equipo comercial ve inventario y demanda
--       60 · escribir     — analista, director, admin
--       80 · borrar un desarrollo, un vehículo o una oportunidad
--
--     La carga comercial del día a día —una propiedad nueva, un
--     comprador que llama— baja a 40 para escribir: pedir nivel 60 para
--     anotar un teléfono habría dejado la base madre sin alimentar, que
--     es la única forma segura de que este módulo no sirva de nada.
--
--     El Super Admin de plataforma NO entra. Igual que en 0073 y 0096:
--     quien mantiene el software no es dueño de la cartera de su
--     cliente ni de los teléfonos de sus compradores.
--
-- 2 · BORRADO LÓGICO. El motor de datos hace DELETE de verdad. Aquí un
--     DELETE se convierte en `deleted_at = now()` y las políticas de
--     lectura esconden lo borrado. En un expediente de predio —con su
--     matrícula y sus gravámenes— borrar sin rastro no es una opción.
--
--     Las dos tablas que NO lo llevan son las de cruce:
--     `rei_opportunity_scores` y `rei_cashflow_periods`. Una
--     calificación retirada o un periodo eliminado no son historia que
--     preservar: son una celda que se vació, y guardarlas invisibles
--     rompería el `unique` la próxima vez que se vuelva a calificar.
--
-- 3 · REGISTRO DEL MÓDULO. `realestate`, en el plan Enterprise, al lado
--     de `capital`.
-- ===========================================================

-- ---------- 1 · BORRADO LÓGICO ----------
-- Se reutiliza `ci_borrado_logico()` de 0096: hace `update ... set
-- deleted_at = now()` sobre `tg_table_name` y devuelve null para
-- cancelar el DELETE físico. Es genérica; copiarla con otro prefijo
-- habría sido duplicar por decoración.
do $$
declare t text;
begin
  foreach t in array array['rei_parameters','rei_properties','rei_buyers','rei_opportunities',
                           'rei_criteria','rei_stages','rei_vehicles','rei_developments',
                           'rei_milestones','rei_feasibility','rei_rental_advances'] loop
    execute format('drop trigger if exists %I on public.%I', t||'_soft_delete', t);
    execute format('create trigger %I before delete on public.%I
                    for each row execute function public.ci_borrado_logico()', t||'_soft_delete', t);
  end loop;
end $$;

-- ---------- 2 · RLS ----------
alter table public.rei_parameters         enable row level security;
alter table public.rei_properties         enable row level security;
alter table public.rei_buyers             enable row level security;
alter table public.rei_opportunities      enable row level security;
alter table public.rei_criteria           enable row level security;
alter table public.rei_opportunity_scores enable row level security;
alter table public.rei_stages             enable row level security;
alter table public.rei_vehicles           enable row level security;
alter table public.rei_developments       enable row level security;
alter table public.rei_milestones         enable row level security;
alter table public.rei_feasibility        enable row level security;
alter table public.rei_cashflow_periods   enable row level security;
alter table public.rei_rental_advances    enable row level security;

-- Las políticas se escriben una vez y se aplican en lote. Son trece
-- tablas con la misma forma —leer con nivel X, escribir con nivel Y—
-- y escribirlas a mano trece veces garantiza que la número nueve
-- quede con el umbral de otra.
--
-- `p_borrar` sube a 80 solo donde borrar destruye trabajo de meses:
-- un desarrollo, su predio, su vehículo. Un teléfono mal escrito lo
-- borra quien lo escribió.
do $$
declare
  r record;
  v_soft text;
begin
  for r in
    select * from (values
      -- tabla                      leer  escribir  borrar  soft
      ('rei_parameters',              40,      60,     80,  true),
      ('rei_properties',              40,      40,     60,  true),
      ('rei_buyers',                  40,      40,     60,  true),
      ('rei_opportunities',           40,      60,     80,  true),
      ('rei_criteria',                40,      60,     80,  true),
      ('rei_opportunity_scores',      40,      60,     60,  false),
      ('rei_stages',                  40,      60,     80,  true),
      ('rei_vehicles',                40,      60,     80,  true),
      ('rei_developments',            40,      60,     80,  true),
      ('rei_milestones',              40,      60,     60,  true),
      ('rei_feasibility',             60,      60,     80,  true),
      ('rei_cashflow_periods',        60,      60,     60,  false),
      ('rei_rental_advances',         40,      60,     80,  true)
    ) as t(tabla, leer, escribir, borrar, soft)
  loop
    execute format('drop policy if exists %I on public.%I', r.tabla||'_leer',     r.tabla);
    execute format('drop policy if exists %I on public.%I', r.tabla||'_crear',    r.tabla);
    execute format('drop policy if exists %I on public.%I', r.tabla||'_editar',   r.tabla);
    execute format('drop policy if exists %I on public.%I', r.tabla||'_borrar',   r.tabla);

    -- Lo borrado no se lee. En las tablas de cruce no hay columna que
    -- mirar, así que la condición se omite en vez de inventarla.
    v_soft := case when r.soft then 'deleted_at is null and ' else '' end;

    execute format($p$create policy %I on public.%I for select to authenticated
      using (%s public.has_company_level(company_id, %s))$p$,
      r.tabla||'_leer', r.tabla, v_soft, r.leer);

    execute format($p$create policy %I on public.%I for insert to authenticated
      with check (public.has_company_level(company_id, %s))$p$,
      r.tabla||'_crear', r.tabla, r.escribir);

    execute format($p$create policy %I on public.%I for update to authenticated
      using (public.has_company_level(company_id, %s))
      with check (public.has_company_level(company_id, %s))$p$,
      r.tabla||'_editar', r.tabla, r.escribir, r.escribir);

    execute format($p$create policy %I on public.%I for delete to authenticated
      using (public.has_company_level(company_id, %s))$p$,
      r.tabla||'_borrar', r.tabla, r.borrar);
  end loop;
end $$;

-- La prefactibilidad y su flujo piden 60 hasta para LEER, y es el único
-- lugar del módulo donde el umbral de lectura sube. No es celo: ahí
-- está el margen del proyecto, el costo real de obra y el punto de
-- equilibrio. Quien muestra un inmueble no necesita saber con cuánto
-- margen se vende el edificio, y si lo supiera lo negociaría.

-- ---------- 3 · EL MÓDULO ----------
insert into public.modules (slug, name, description, active, sort)
values ('realestate', 'Real Estate Intelligence',
        'Originación de suelo, calificación de oportunidades, prefactibilidad de proyectos, estructura fiduciaria y el cruce entre la oferta en inventario y la demanda registrada.',
        true, 125)
on conflict (slug) do update
   set name = excluded.name, description = excluded.description,
       active = excluded.active, sort = excluded.sort;

-- Enterprise, igual que Capital Intelligence. Los dos módulos que
-- justifican ese plan son los que analizan y estructuran; el resto
-- de la plataforma opera.
insert into public.plan_modules (plan_id, module_id, max_tier)
select p.id, m.id, 'enterprise'::public.module_tier
  from public.plans p
  join public.product_lines pl on pl.id = p.product_line_id and pl.slug = 'company'
  cross join public.modules m
 where p.slug = 'enterprise' and m.slug = 'realestate'
on conflict (plan_id, module_id) do update set max_tier = excluded.max_tier;
