-- ===========================================================
-- 0120 · REAL ESTATE INTELLIGENCE — el núcleo
-- -----------------------------------------------------------
-- El módulo hermano de Capital Intelligence. CI responde «¿cuánto
-- capital hace falta, de dónde sale y cómo va contra lo prometido?».
-- Este responde la pregunta de antes: «¿qué se desarrolla, sobre qué
-- predio, con qué demanda detrás y si el proyecto se sostiene».
--
-- Van a la par y se tocan en un punto: un desarrollo puede apuntar a
-- un proyecto de CI (`rei_developments.ci_project_id`). Cuando lo
-- hace, la prefactibilidad de aquí alimenta la conversación y el
-- levantamiento de allá. Cuando no, este módulo se sostiene solo.
--
-- Cinco capas, en el orden en que ocurre el trabajo:
--
--   supuestos → oferta y demanda → oportunidad → desarrollo → modelo
--
-- El prefijo es `rei_` por la misma razón que allá fue `ci_`:
-- `properties` no existe, pero `projects` sí (es el Taller de STUDIO)
-- y `customers` también (es el CRM de COMPANY). El inventario de una
-- inmobiliaria no es el catálogo de productos de una pescadería, y
-- meterlo en `products` habría roto las dos cosas a la vez.
--
-- Aditiva de principio a fin: no toca ni una tabla existente.
--
-- Sobre los catálogos: tipo de inmueble, estado comercial, etapa y
-- situación jurídica van como TEXTO y no como enums. Una inmobiliaria
-- de Pamplona vende lotes y cabañas; otra vende bodegas. Agregar una
-- tipología no puede exigir una migración. Las opciones se declaran
-- en el esquema del frontend, que es donde se leen. Lleva check solo
-- lo que decide comportamiento.
-- ===========================================================

-- ---------- 1 · SUPUESTOS ----------
-- Toda cifra estructural del módulo —costo de obra por m², WACC
-- objetivo, DSCR mínimo, tarifas notariales— vive aquí y no dentro
-- de una fórmula. Es la diferencia entre poder discutir un supuesto
-- y tener que abrir el código para encontrarlo.
--
-- `slug` es la llave con la que el cálculo los busca. Que sea único
-- por empresa y no global permite que cada organización cambie el
-- valor sin tocar a las demás, y que ninguna pueda borrar la llave
-- que el motor espera sin darse cuenta.
create table if not exists public.rei_parameters (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  slug        text not null,
  category    text not null default 'financiero',
  name        text not null,
  value       numeric(18,6),
  -- Cómo se escribe y cómo entra en la fórmula. `pct` se guarda en
  -- puntos porcentuales (16 = 16%), no en fracción: es como lo dice
  -- quien lo configura, y convertir una vez en el cálculo es más
  -- barato que explicar por qué 0,16 significa dieciséis.
  unit        text not null default 'pct'
              check (unit in ('pct','dinero','dinero_m2','numero','meses')),
  source      text,
  notes       text,
  sort        int  not null default 0,
  custom      jsonb not null default '{}'::jsonb,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint rei_parameters_slug_unico unique (company_id, slug)
);
comment on table public.rei_parameters is
  'Real Estate Intelligence · supuestos de mercado, obra, financiación y tributarios. Ninguna fórmula del módulo lleva una constante escrita adentro: la lee de aquí.';
comment on column public.rei_parameters.unit is
  'pct se guarda en puntos porcentuales (16 = 16%). El cálculo divide por 100 una sola vez.';

-- ---------- 2 · OFERTA ----------
-- El inventario: lo que la inmobiliaria tiene para vender y quién se
-- lo entregó. Es la base madre de la que salen los comparables de
-- precio/m², la tasa de cierre y la efectividad por canal.
create table if not exists public.rei_properties (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  code          text,                       -- lo pone next_code(): INM-2026-000001
  owner_name    text not null,
  contact       text,
  entry_date    date,
  city          text,
  neighborhood  text,
  property_type text not null default 'casa',
  area_m2       numeric(14,2),
  appraisal     numeric(18,2),              -- avalúo comercial
  list_price    numeric(18,2),              -- precio publicado

  -- El precio por m² NO se guarda a mano. Se deriva, y por eso no
  -- puede desincronizarse del precio: la planilla de la que viene
  -- este módulo lo tenía como fórmula y era lo correcto.
  price_m2      numeric(18,2) generated always as (
                  case when area_m2 > 0 and list_price > 0
                       then round(list_price / area_m2, 2) end) stored,

  legal_status      text,                   -- papeles al día, en proceso, sucesión…
  payment_terms     text,                   -- efectivo, crédito, permuta, subsidio
  commercial_status text not null default 'disponible',
  sale_date         date,
  sale_price        numeric(18,2),
  channel           text,                   -- de dónde llegó la captación
  notes         text,
  custom        jsonb not null default '{}'::jsonb,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,

  constraint rei_properties_code_unico unique (company_id, code),
  constraint rei_properties_area_positiva check (area_m2 is null or area_m2 > 0)
);
comment on table public.rei_properties is
  'Real Estate Intelligence · inventario de inmuebles en comercialización. Base de los comparables de mercado.';
comment on column public.rei_properties.price_m2 is
  'Derivado de precio publicado ÷ área. Nunca se escribe a mano.';

-- ---------- 3 · DEMANDA ----------
-- El otro lado. Existe separado de `customers` a propósito: un
-- comprador que busca apartamento en un sector y tiene presupuesto
-- y subsidio no es un cliente con historial de pedidos, y forzarlo
-- a esa ficha habría perdido justo los campos con los que se cruza
-- la brecha oferta/demanda.
create table if not exists public.rei_buyers (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  code          text,                       -- CMP-2026-000001
  name          text not null,
  contact       text,
  registered_at date,
  client_status text not null default 'activo',
  city          text,
  wanted_type   text,                       -- qué tipología busca
  sector        text,                       -- barrio o zona de interés
  payment_terms text,
  subsidy_type  text,
  budget        numeric(18,2),
  process_status text,                      -- en qué punto del proceso va
  notes         text,
  custom        jsonb not null default '{}'::jsonb,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,

  constraint rei_buyers_code_unico unique (company_id, code),
  constraint rei_buyers_presupuesto check (budget is null or budget >= 0)
);
comment on table public.rei_buyers is
  'Real Estate Intelligence · demanda registrada. Cruza con el inventario para medir la brecha por tipología.';

-- ---------- 4 · OPORTUNIDADES ----------
-- Un predio que podría convertirse en un desarrollo. Lo que decide
-- si se estructura o no es el scoring, y lo que decide si se puede
-- construir es la ficha normativa: índices, altura y uso del suelo.
create table if not exists public.rei_opportunities (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  code         text,                        -- OPT-2026-000001
  name         text not null,
  municipality text,
  address      text,
  area_m2      numeric(14,2),
  asking_price numeric(18,2),
  price_m2     numeric(18,2) generated always as (
                 case when area_m2 > 0 and asking_price > 0
                      then round(asking_price / area_m2, 2) end) stored,
  owner_contact text,

  -- Ficha normativa. Sin estos tres campos no hay m² edificables, y
  -- sin m² edificables la prefactibilidad es una opinión.
  land_use            text,                 -- uso del suelo según el POT
  occupancy_index     numeric(6,4),         -- índice de ocupación
  construction_index  numeric(6,4),         -- índice de construcción
  max_height          int,                  -- pisos permitidos

  -- Situación jurídica. Se guarda el número de matrícula porque es lo
  -- que identifica el predio de verdad; la dirección se repite.
  registration_number text,                 -- matrícula inmobiliaria
  title_status        text,
  encumbrances        text,                 -- gravámenes, limitaciones, afectaciones

  source       text,                        -- cómo llegó
  status       text not null default 'identificada',
  notes        text,
  custom       jsonb not null default '{}'::jsonb,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,

  constraint rei_opportunities_code_unico unique (company_id, code),
  constraint rei_opportunities_indices check (
    (occupancy_index    is null or (occupancy_index    >= 0 and occupancy_index    <= 1)) and
    (construction_index is null or  construction_index >= 0) and
    (max_height         is null or  max_height between 1 and 200))
);
comment on table public.rei_opportunities is
  'Real Estate Intelligence · predio en evaluación, con su ficha normativa y su situación jurídica.';
comment on column public.rei_opportunities.occupancy_index is
  'Fracción del lote que se puede ocupar en planta (0 a 1). El índice de construcción, en cambio, es un múltiplo del área del lote y puede pasar de 1.';

-- ---------- 5 · CRITERIOS DE CALIFICACIÓN ----------
-- Los pesos son de la organización, no del código. Una firma que
-- desarrolla VIS pondera la financiabilidad distinto que un fondo que
-- compra suelo para esperar, y las dos tienen razón.
create table if not exists public.rei_criteria (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null,
  weight_pct  numeric(7,4) not null default 0,
  measures    text,                          -- qué mide, en una frase
  level_low   text,                          -- cómo se ve un 1
  level_mid   text,                          -- cómo se ve un 3
  level_high  text,                          -- cómo se ve un 5
  sort        int  not null default 0,
  active      boolean not null default true,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,

  constraint rei_criteria_nombre_unico unique (company_id, name),
  constraint rei_criteria_peso_rango   check (weight_pct >= 0 and weight_pct <= 100)
);
comment on table public.rei_criteria is
  'Real Estate Intelligence · criterios ponderados con los que se decide qué oportunidad se estructura primero.';

-- La calificación de UN criterio sobre UNA oportunidad. Una fila por
-- cruce y no un jsonb en la oportunidad: así se puede consultar «qué
-- oportunidades fallan en situación jurídica» sin desarmar un objeto.
create table if not exists public.rei_opportunity_scores (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id)          on delete cascade,
  opportunity_id uuid not null references public.rei_opportunities(id)  on delete cascade,
  criterion_id   uuid not null references public.rei_criteria(id)       on delete cascade,
  score          int  not null check (score between 1 and 5),
  note           text,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (opportunity_id, criterion_id)
);
comment on table public.rei_opportunity_scores is
  'Real Estate Intelligence · calificación de 1 a 5 de un criterio sobre una oportunidad.';

-- ---------- 6 · ETAPAS DEL PROCESO ----------
-- El pipeline es una tabla y no una lista en el código porque su
-- LARGO decide el % de avance. Una firma que no monta fiducia tiene
-- once etapas, no trece, y su 100% tiene que seguir siendo 100%.
create table if not exists public.rei_stages (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name       text not null,
  phase      text not null default 'originacion',
  sort       int  not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint rei_stages_nombre_unico unique (company_id, name)
);
comment on table public.rei_stages is
  'Real Estate Intelligence · etapas del proceso Terreno → Cierre. Configurable: su largo decide el % de avance.';

-- ---------- 7 · VEHÍCULOS ----------
-- La SPE, el patrimonio autónomo, la fiducia de recaudo. Existe para
-- que el aislamiento de riesgo entre proyectos deje de ser una nota
-- en un documento y pase a ser una fila con su punto de equilibrio.
create table if not exists public.rei_vehicles (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  name          text not null,
  vehicle_type  text not null default 'spe',
  tax_id        text,                        -- NIT / RUT
  trustee       text,                        -- fiduciaria
  trust_account text,                        -- patrimonio autónomo / encargo

  -- El punto de equilibrio es la condición que libera los recursos de
  -- preventa. Guardarlo aquí —y no en el proyecto— es correcto: lo
  -- exige el vehículo, no el desarrollo.
  equilibrium_pct  numeric(7,4),
  equilibrium_date date,

  status        text not null default 'en_constitucion',
  notes         text,
  custom        jsonb not null default '{}'::jsonb,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,

  constraint rei_vehicles_nombre_unico unique (company_id, name),
  constraint rei_vehicles_equilibrio   check (equilibrium_pct is null
                                              or (equilibrium_pct >= 0 and equilibrium_pct <= 100))
);
comment on table public.rei_vehicles is
  'Real Estate Intelligence · vehículo jurídico o fiduciario de un desarrollo: SPE, patrimonio autónomo, fiducia de recaudo.';

-- ---------- 8 · DESARROLLOS ----------
-- La oportunidad que se aprobó y ya camina. Lo que la diferencia de
-- la oportunidad es que tiene etapa, responsable y fecha: dejó de ser
-- una evaluación y pasó a ser trabajo.
create table if not exists public.rei_developments (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id)         on delete cascade,
  code           text,                       -- DES-2026-000001
  name           text not null,
  opportunity_id uuid references public.rei_opportunities(id) on delete set null,
  vehicle_id     uuid references public.rei_vehicles(id)      on delete set null,

  -- El puente con Capital Intelligence. `on delete set null` y no
  -- cascade: si allá se borra el proyecto de inversión, el desarrollo
  -- sigue existiendo — es obra, no una carpeta de ronda.
  ci_project_id  uuid references public.ci_projects(id)       on delete set null,

  municipality   text,
  stage_id       uuid references public.rei_stages(id) on delete set null,
  manager        text,
  product        text not null default 'vis',
  units          int,
  start_date     date,
  target_date    date,
  next_milestone text,
  status         text not null default 'activo',
  notes          text,
  custom         jsonb not null default '{}'::jsonb,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,

  constraint rei_developments_code_unico unique (company_id, code),
  constraint rei_developments_unidades   check (units is null or units > 0)
);
comment on table public.rei_developments is
  'Real Estate Intelligence · proyecto de desarrollo en curso, con su etapa, su vehículo y su predio.';
comment on column public.rei_developments.ci_project_id is
  'Puente con Capital Intelligence. Cuando está, el mismo desarrollo tiene allá su modelo, su ronda y su cap table.';

-- ---------- 9 · HITOS ----------
create table if not exists public.rei_milestones (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id)          on delete cascade,
  development_id uuid not null references public.rei_developments(id)   on delete cascade,
  name           text not null,
  description    text,
  due_date       date,
  done_date      date,
  status         text not null default 'pendiente',
  owner          text,
  amount_conditioned numeric(18,2),
  sort           int not null default 0,
  custom         jsonb not null default '{}'::jsonb,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
comment on table public.rei_milestones is
  'Real Estate Intelligence · hitos de un desarrollo, con el capital o el desembolso que condicionan.';

-- ---------- 10 · PREFACTIBILIDAD ----------
-- El modelo que dice si el proyecto se sostiene. Guarda SUPUESTOS, no
-- resultados: los ingresos, el costo total, el margen, la TIR y el
-- veredicto los calcula `rei_prefactibilidad()` en 0122.
--
-- Esa decisión es la misma de CI y por el mismo motivo: si el margen
-- se guardara, bastaría con que alguien cambiara el precio/m² sin
-- recalcular para que la pantalla mintiera con total convicción.
create table if not exists public.rei_feasibility (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id)        on delete cascade,
  development_id uuid not null references public.rei_developments(id) on delete cascade,
  label          text,
  version        int  not null default 1,

  units          int,
  avg_area_m2    numeric(14,2),
  price_m2       numeric(18,2),
  product        text not null default 'vis',

  -- Cada porcentaje puede venir del supuesto de la organización o
  -- pisarse aquí para ESTE proyecto. Null = usa el parámetro. Es lo
  -- que permite modelar un proyecto atípico sin mover el estándar de
  -- la casa.
  land_cost      numeric(18,2) not null default 0,
  direct_cost_m2 numeric(18,2),
  indirect_pct   numeric(7,4),
  financial_pct  numeric(7,4),
  commercial_pct numeric(7,4),
  discount_rate  numeric(7,4),               -- EA, para el VAN
  equilibrium_pct numeric(7,4),              -- % de unidades en preventa

  -- Cada cuánto es un periodo del flujo. Decide dos cosas: con qué
  -- tasa se descuenta y cómo se anualiza la TIR. Guardarlo es lo que
  -- evita el error clásico de leer una TIR trimestral como si fuera
  -- anual y aprobar un proyecto por cuatro veces su rentabilidad.
  period_kind    text not null default 'trimestre'
                 check (period_kind in ('mes','trimestre','semestre','anio')),

  state          text not null default 'borrador'
                 check (state in ('borrador','validado','archivado')),
  notes          text,
  custom         jsonb not null default '{}'::jsonb,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,

  constraint rei_feasibility_version_unica unique (development_id, version),
  constraint rei_feasibility_unidades  check (units       is null or units       > 0),
  constraint rei_feasibility_area      check (avg_area_m2 is null or avg_area_m2 > 0),
  constraint rei_feasibility_precio    check (price_m2    is null or price_m2    > 0)
);
comment on table public.rei_feasibility is
  'Real Estate Intelligence · supuestos de prefactibilidad de un desarrollo. Los resultados NO se guardan: los calcula rei_prefactibilidad().';
comment on column public.rei_feasibility.direct_cost_m2 is
  'Null = toma el parámetro de la organización según el producto (VIS / No VIS). Se escribe solo para pisar el estándar en ESTE proyecto.';
comment on column public.rei_feasibility.land_cost is
  'El costo del suelo. La planilla de origen no lo tenía en la pila de costos; aquí entra al costo total, y en cero reproduce exactamente aquel modelo.';

-- El flujo por periodo. La curva S es un supuesto y se edita: por eso
-- son filas y no una fórmula. Un periodo es lo que la organización
-- decida —trimestre, mes—; el módulo solo necesita que estén en orden.
create table if not exists public.rei_cashflow_periods (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id)       on delete cascade,
  feasibility_id uuid not null references public.rei_feasibility(id) on delete cascade,
  period_no      int  not null,
  outflow        numeric(18,2) not null default 0,
  inflow         numeric(18,2) not null default 0,
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint rei_cashflow_periodo_unico unique (feasibility_id, period_no),
  constraint rei_cashflow_periodo_valido check (period_no between 0 and 400),
  constraint rei_cashflow_signos check (outflow >= 0 and inflow >= 0)
);
comment on table public.rei_cashflow_periods is
  'Real Estate Intelligence · egresos e ingresos por periodo de una prefactibilidad. El flujo neto y la TIR se derivan, no se guardan.';
comment on column public.rei_cashflow_periods.outflow is
  'Se carga en POSITIVO. El signo lo pone el cálculo al armar el vector de flujos: pedirle a quien carga que escriba negativos es pedirle que se equivoque.';

-- ---------- 11 · ADELANTO DE RENTA ----------
-- El producto de liquidez sobre contratos de arrendamiento: el
-- propietario cede los flujos de N meses y recibe hoy el valor
-- presente menos el descuento por riesgo y la comisión.
--
-- ADVERTENCIA DE PRODUCTO, escrita donde se va a leer: esto solo es
-- legal con RECURSOS PROPIOS de la sociedad o de inversionistas por
-- cuentas en participación. Captar dinero del público para fondearlo
-- es captación masiva no autorizada. La tabla no puede impedirlo;
-- `funding_source` existe para que la decisión quede registrada y
-- alguien tenga que escribirla.
create table if not exists public.rei_rental_advances (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id)        on delete cascade,
  code         text,                         -- ADR-2026-000001
  property_id  uuid references public.rei_properties(id) on delete set null,
  owner_name   text not null,
  monthly_rent numeric(18,2) not null,
  months       int not null,
  discount_pct numeric(7,4) not null default 0,
  admin_fee_pct numeric(7,4) not null default 0,

  -- Lo que recibe el propietario. Derivado, por la misma razón que el
  -- precio/m²: es la cifra que se firma y no puede quedar vieja.
  advanced_amount numeric(18,2) generated always as (
    round(monthly_rent * months * (1 - discount_pct/100 - admin_fee_pct/100), 2)) stored,

  funding_source   text not null default 'recursos_propios',
  insurance_status text,                     -- póliza de arrendamiento
  promissory_note  boolean not null default false,  -- pagaré con carta de instrucciones
  start_date   date,
  status       text not null default 'solicitado',
  notes        text,
  custom       jsonb not null default '{}'::jsonb,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,

  constraint rei_rental_advances_code_unico unique (company_id, code),
  constraint rei_rental_advances_meses   check (months between 1 and 120),
  constraint rei_rental_advances_canon   check (monthly_rent > 0),
  -- El descuento más la comisión no pueden llegar al 100%: un adelanto
  -- de cero pesos no es un producto, es un error de carga.
  constraint rei_rental_advances_castigo check (discount_pct >= 0 and admin_fee_pct >= 0
                                                and discount_pct + admin_fee_pct < 100)
);
comment on table public.rei_rental_advances is
  'Real Estate Intelligence · adelanto de cánones sobre un contrato de arrendamiento. Solo con recursos propios o cuentas en participación: fondearlo con dinero del público es captación masiva no autorizada.';

-- ---------- ÍNDICES (toda FK con cobertura) ----------
create index if not exists rei_parameters_company_idx    on public.rei_parameters(company_id, category, sort) where deleted_at is null;
create index if not exists rei_properties_company_idx    on public.rei_properties(company_id) where deleted_at is null;
create index if not exists rei_properties_estado_idx     on public.rei_properties(company_id, commercial_status);
create index if not exists rei_properties_tipo_idx       on public.rei_properties(company_id, property_type);
create index if not exists rei_properties_ingreso_idx    on public.rei_properties(company_id, entry_date);
create index if not exists rei_properties_venta_idx      on public.rei_properties(company_id, sale_date);
create index if not exists rei_buyers_company_idx        on public.rei_buyers(company_id) where deleted_at is null;
create index if not exists rei_buyers_estado_idx         on public.rei_buyers(company_id, client_status);
create index if not exists rei_buyers_tipo_idx           on public.rei_buyers(company_id, wanted_type);
create index if not exists rei_buyers_registro_idx       on public.rei_buyers(company_id, registered_at);
create index if not exists rei_opportunities_company_idx on public.rei_opportunities(company_id) where deleted_at is null;
create index if not exists rei_opportunities_estado_idx  on public.rei_opportunities(company_id, status);
create index if not exists rei_criteria_company_idx      on public.rei_criteria(company_id, sort) where deleted_at is null;
create index if not exists rei_scores_company_idx        on public.rei_opportunity_scores(company_id);
create index if not exists rei_scores_oportunidad_idx    on public.rei_opportunity_scores(opportunity_id);
create index if not exists rei_scores_criterio_idx       on public.rei_opportunity_scores(criterion_id);
create index if not exists rei_stages_company_idx        on public.rei_stages(company_id, sort) where deleted_at is null;
create index if not exists rei_vehicles_company_idx      on public.rei_vehicles(company_id) where deleted_at is null;
create index if not exists rei_developments_company_idx  on public.rei_developments(company_id) where deleted_at is null;
create index if not exists rei_developments_etapa_idx    on public.rei_developments(stage_id);
create index if not exists rei_developments_oport_idx    on public.rei_developments(opportunity_id);
create index if not exists rei_developments_vehiculo_idx on public.rei_developments(vehicle_id);
create index if not exists rei_developments_ci_idx       on public.rei_developments(ci_project_id);
create index if not exists rei_milestones_company_idx    on public.rei_milestones(company_id);
create index if not exists rei_milestones_desarrollo_idx on public.rei_milestones(development_id, due_date);
create index if not exists rei_feasibility_company_idx   on public.rei_feasibility(company_id) where deleted_at is null;
create index if not exists rei_feasibility_desarrollo_idx on public.rei_feasibility(development_id, version desc);
create index if not exists rei_cashflow_company_idx      on public.rei_cashflow_periods(company_id);
create index if not exists rei_cashflow_modelo_idx       on public.rei_cashflow_periods(feasibility_id, period_no);
create index if not exists rei_rental_company_idx        on public.rei_rental_advances(company_id) where deleted_at is null;
create index if not exists rei_rental_inmueble_idx       on public.rei_rental_advances(property_id);

-- ---------- updated_at ----------
do $$
declare t text;
begin
  foreach t in array array['rei_parameters','rei_properties','rei_buyers','rei_opportunities',
                           'rei_criteria','rei_opportunity_scores','rei_stages','rei_vehicles',
                           'rei_developments','rei_milestones','rei_feasibility',
                           'rei_cashflow_periods','rei_rental_advances'] loop
    execute format('drop trigger if exists %I on public.%I', t||'_touch', t);
    execute format('create trigger %I before update on public.%I
                    for each row execute function public.touch_updated_at()', t||'_touch', t);
  end loop;
end $$;

-- ---------- CAMPOS PROPIOS ----------
-- El mismo trigger que valida `custom` en el resto de la plataforma.
-- `validate_custom` usa `tg_table_name`, así que la `entity` de
-- custom_fields es el nombre de la tabla. Una sola verdad.
do $$
declare t text;
begin
  foreach t in array array['rei_parameters','rei_properties','rei_buyers','rei_opportunities',
                           'rei_vehicles','rei_developments','rei_milestones',
                           'rei_feasibility','rei_rental_advances'] loop
    execute format('drop trigger if exists %I on public.%I', t||'_validate_custom', t);
    execute format('create trigger %I before insert or update of custom on public.%I
                    for each row execute function public.trg_validate_custom()', t||'_validate_custom', t);
  end loop;
end $$;

-- ---------- CÓDIGOS ----------
-- Se ponen solos, como el de un pedido o el de un proyecto de CI.
-- El prefijo va como argumento del trigger para no escribir cuatro
-- funciones que solo se diferencian en tres letras.
create or replace function public.rei_codigo()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.code is null or btrim(new.code) = '' then
    new.code := public.next_code(new.company_id, tg_argv[0]);
  end if;
  return new;
end $$;
revoke execute on function public.rei_codigo() from public, anon, authenticated;

drop trigger if exists rei_properties_code on public.rei_properties;
create trigger rei_properties_code before insert on public.rei_properties
  for each row execute function public.rei_codigo('INM');

drop trigger if exists rei_buyers_code on public.rei_buyers;
create trigger rei_buyers_code before insert on public.rei_buyers
  for each row execute function public.rei_codigo('CMP');

drop trigger if exists rei_opportunities_code on public.rei_opportunities;
create trigger rei_opportunities_code before insert on public.rei_opportunities
  for each row execute function public.rei_codigo('OPT');

drop trigger if exists rei_developments_code on public.rei_developments;
create trigger rei_developments_code before insert on public.rei_developments
  for each row execute function public.rei_codigo('DES');

drop trigger if exists rei_rental_advances_code on public.rei_rental_advances;
create trigger rei_rental_advances_code before insert on public.rei_rental_advances
  for each row execute function public.rei_codigo('ADR');

-- ---------- COHERENCIA ENTRE NIVELES ----------
-- Una prefactibilidad de la empresa A colgando de un desarrollo de la
-- empresa B sería una fuga que RLS no vería: las dos filas tendrían su
-- company_id correcto. Se corta aquí, con el mismo `ci_misma_empresa`
-- que ya hace este trabajo en Capital Intelligence — la función es
-- genérica (lee la tabla y la columna de sus argumentos), así que
-- duplicarla con otro prefijo habría sido copiar por decoración.
drop trigger if exists rei_developments_misma_empresa_oport on public.rei_developments;
create trigger rei_developments_misma_empresa_oport
  before insert or update of opportunity_id on public.rei_developments
  for each row when (new.opportunity_id is not null)
  execute function public.ci_misma_empresa('rei_opportunities', 'opportunity_id');

drop trigger if exists rei_developments_misma_empresa_vehiculo on public.rei_developments;
create trigger rei_developments_misma_empresa_vehiculo
  before insert or update of vehicle_id on public.rei_developments
  for each row when (new.vehicle_id is not null)
  execute function public.ci_misma_empresa('rei_vehicles', 'vehicle_id');

drop trigger if exists rei_developments_misma_empresa_etapa on public.rei_developments;
create trigger rei_developments_misma_empresa_etapa
  before insert or update of stage_id on public.rei_developments
  for each row when (new.stage_id is not null)
  execute function public.ci_misma_empresa('rei_stages', 'stage_id');

-- El puente con Capital Intelligence pasa por la misma aduana: apuntar
-- a un proyecto de inversión de otra organización sería exactamente la
-- fuga que este módulo no puede permitirse.
drop trigger if exists rei_developments_misma_empresa_ci on public.rei_developments;
create trigger rei_developments_misma_empresa_ci
  before insert or update of ci_project_id on public.rei_developments
  for each row when (new.ci_project_id is not null)
  execute function public.ci_misma_empresa('ci_projects', 'ci_project_id');

drop trigger if exists rei_milestones_misma_empresa on public.rei_milestones;
create trigger rei_milestones_misma_empresa
  before insert or update of development_id on public.rei_milestones
  for each row execute function public.ci_misma_empresa('rei_developments', 'development_id');

drop trigger if exists rei_feasibility_misma_empresa on public.rei_feasibility;
create trigger rei_feasibility_misma_empresa
  before insert or update of development_id on public.rei_feasibility
  for each row execute function public.ci_misma_empresa('rei_developments', 'development_id');

drop trigger if exists rei_cashflow_misma_empresa on public.rei_cashflow_periods;
create trigger rei_cashflow_misma_empresa
  before insert or update of feasibility_id on public.rei_cashflow_periods
  for each row execute function public.ci_misma_empresa('rei_feasibility', 'feasibility_id');

drop trigger if exists rei_scores_misma_empresa_oport on public.rei_opportunity_scores;
create trigger rei_scores_misma_empresa_oport
  before insert or update of opportunity_id on public.rei_opportunity_scores
  for each row execute function public.ci_misma_empresa('rei_opportunities', 'opportunity_id');

drop trigger if exists rei_scores_misma_empresa_criterio on public.rei_opportunity_scores;
create trigger rei_scores_misma_empresa_criterio
  before insert or update of criterion_id on public.rei_opportunity_scores
  for each row execute function public.ci_misma_empresa('rei_criteria', 'criterion_id');

drop trigger if exists rei_rental_misma_empresa on public.rei_rental_advances;
create trigger rei_rental_misma_empresa
  before insert or update of property_id on public.rei_rental_advances
  for each row when (new.property_id is not null)
  execute function public.ci_misma_empresa('rei_properties', 'property_id');
