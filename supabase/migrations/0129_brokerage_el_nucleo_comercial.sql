-- ===========================================================
-- 0129 · BROKERAGE — el núcleo comercial
-- -----------------------------------------------------------
-- Real Estate Intelligence nació por el lado del DESARROLLO: un
-- predio, su calificación, su prefactibilidad, su vehículo. Es la
-- mitad de abajo del embudo y está entera.
--
-- Falta la de arriba, que es la que produce los datos de la otra: la
-- operación comercial del día. Alguien llama preguntando por un
-- apartamento; se le muestra; hace una oferta; se firma. Hoy eso vive
-- en WhatsApp y en la memoria del corredor, y por eso el inventario
-- sabe QUÉ se vendió pero no CÓMO, ni en cuántos días, ni de qué
-- canal vino, ni qué se dejó de hacer.
--
-- Seis tablas, en el orden en que ocurre el trabajo:
--
--   lead → visita → negociación → contrato
--            ↑                        ↑
--        actividad                  meta
--
-- CINCO DECISIONES que conviene dejar escritas, porque no se
-- deducen del esquema:
--
-- 1 · LA FECHA DE CADA ETAPA LA PONE LA BASE. `rei_leads` no lleva
--     una columna «etapa» y nada más: lleva `contacted_at`,
--     `qualified_at`, `offer_at`, `won_at`… y un trigger las estampa
--     cuando la etapa cambia. Sin eso, «tasa de conversión» y «días
--     por etapa» son incalculables: se sabría dónde está cada lead
--     hoy y nunca cuánto tardó en llegar. Pedirle al corredor que
--     escriba la fecha a mano es garantizar que no esté.
--
-- 2 · EL INGRESO ESPERADO DE UNA NEGOCIACIÓN ES LA COMISIÓN, no el
--     precio del inmueble. Es la misma decisión de 0127 y por el
--     mismo motivo: la firma intermedia. Poner el precio del inmueble
--     en el forecast multiplicaría por treinta lo que de verdad
--     entra, en la misma pantalla donde alguien lee cuánto va a
--     facturar el mes. Va como columna generada —comisión explícita
--     si la hay, si no valor × porcentaje— para que no pueda quedar
--     vieja.
--
-- 3 · TODO REGISTRO COMERCIAL VIVO LLEVA PRÓXIMA ACCIÓN. Lead,
--     negociación, visita y contrato tienen `next_action` y
--     `next_action_date`. No es decoración: un lead sin próxima
--     acción es un lead que nadie va a volver a tocar, y el panel lo
--     cuenta como lo que es. Es el control principal del sistema.
--
-- 4 · LA ACTIVIDAD SE ENLAZA CON COLUMNAS, NO CON (entidad, id). La
--     tentación del CRM genérico es una tabla polimórfica con dos
--     columnas de texto. Aquí no: cada vínculo es una FK de verdad,
--     con su `on delete` y su aduana de empresa. Son ocho columnas
--     casi siempre nulas y valen lo que cuestan — con el par
--     (entidad, id) nada impide apuntar a una fila de otra
--     organización, y es exactamente la fuga que RLS no ve.
--
-- 5 · EL RESPONSABLE ES UN USUARIO, NO UN TEXTO. En Capital
--     Intelligence `owner` es texto y está bien: quien responde por
--     una ronda puede ser alguien de afuera. Aquí no puede serlo: las
--     metas por persona (§12 del documento) exigen comparar el
--     resultado de Juan contra la meta de Juan, y con texto libre
--     «Juan», «juan» y «J. Pérez» son tres corredores.
--
-- Aditiva de principio a fin: no toca ni una tabla existente.
-- ===========================================================

-- ---------- 1 · LEADS ----------
-- La unidad de trabajo del corredor. No es un cliente todavía —puede
-- no dejar ni el apellido— y por eso `name` basta para crearlo: la
-- ficha en `customers` se enlaza cuando la hay, no antes. Un CRM que
-- exige una ficha completa para anotar una llamada es un CRM donde
-- las llamadas no se anotan.
create table if not exists public.rei_leads (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  code         text,                        -- LEAD-2026-000001
  name         text not null,
  contact      text,                        -- teléfono o correo, como llegue

  -- A quién y a qué apunta. Los tres pueden faltar al principio y
  -- llenarse después: así es como ocurre de verdad.
  customer_id  uuid references public.customers(id)      on delete set null,
  buyer_id     uuid references public.rei_buyers(id)     on delete set null,
  property_id  uuid references public.rei_properties(id) on delete set null,

  operation    text not null default 'compra',  -- compra, arriendo, venta, consignacion
  source       text,                            -- de dónde llegó: portal, valla, voz a voz
  campaign     text,
  city         text,
  budget       numeric(18,2),
  broker_id    uuid references auth.users(id) on delete set null,

  -- La etapa. Los valores importan y no solo los nombres: `ganado` y
  -- `perdido` cierran el lead y salen de todo lo que cuenta pipeline.
  stage        text not null default 'nuevo'
               check (stage in ('nuevo','contactado','calificado','con_inmueble',
                                'visita_agendada','visita_hecha','oferta',
                                'negociacion','ganado','perdido')),

  -- Las marcas de tiempo de cada transición. Las escribe el trigger
  -- `rei_leads_sellar_etapa`, no la pantalla. Una etapa a la que se
  -- vuelve conserva la fecha de la PRIMERA vez que se alcanzó: es lo
  -- que hace que «días hasta la primera visita» signifique algo.
  first_contact_at  timestamptz,
  contacted_at      timestamptz,
  qualified_at      timestamptz,
  matched_at        timestamptz,
  visit_scheduled_at timestamptz,
  visit_done_at     timestamptz,
  offer_at          timestamptz,
  negotiation_at    timestamptz,
  won_at            timestamptz,
  lost_at           timestamptz,
  lost_reason       text,

  next_action       text,
  next_action_date  date,

  notes        text,
  custom       jsonb not null default '{}'::jsonb,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,

  constraint rei_leads_code_unico unique (company_id, code),
  constraint rei_leads_presupuesto_positivo check (budget is null or budget >= 0)
);
comment on table public.rei_leads is
  'Brokerage · la demanda en movimiento. Una fila por interés comercial, con la fecha de cada etapa estampada por la base.';
comment on column public.rei_leads.stage is
  'La etapa de hoy. El HISTORIAL vive en las columnas *_at, que pone el trigger: de ahí salen conversión y días por etapa.';
comment on column public.rei_leads.next_action_date is
  'Un lead abierto sin próxima acción es un lead que nadie va a volver a tocar. El panel los cuenta.';

create index if not exists rei_leads_empresa   on public.rei_leads(company_id) where deleted_at is null;
create index if not exists rei_leads_etapa     on public.rei_leads(company_id, stage) where deleted_at is null;
create index if not exists rei_leads_broker    on public.rei_leads(company_id, broker_id) where deleted_at is null;
create index if not exists rei_leads_proxima   on public.rei_leads(company_id, next_action_date) where deleted_at is null;
create index if not exists rei_leads_cliente   on public.rei_leads(customer_id) where customer_id is not null;
create index if not exists rei_leads_inmueble  on public.rei_leads(property_id) where property_id is not null;

-- ---------- 2 · NEGOCIACIONES ----------
-- Lo que el documento llama Deal. Es donde se cruzan cliente,
-- inmueble y corredor, y es la única tabla de la que puede salir un
-- forecast: un lead no tiene monto, y un inmueble no sabe con quién
-- se está negociando.
create table if not exists public.rei_deals (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  code          text,                       -- NEG-2026-000001
  name          text not null,

  lead_id       uuid references public.rei_leads(id)       on delete set null,
  customer_id   uuid references public.customers(id)       on delete set null,
  property_id   uuid references public.rei_properties(id)  on delete set null,
  broker_id     uuid references auth.users(id)             on delete set null,
  city          text,

  deal_type     text not null default 'venta'
                check (deal_type in ('venta','arriendo','administracion','consignacion','permuta','otro')),
  stage         text not null default 'apertura'
                check (stage in ('apertura','propuesta','negociacion','promesa',
                                 'escrituracion','ganado','perdido')),

  property_value  numeric(18,2),            -- el precio que se negocia
  commission_pct  numeric(7,4),             -- en puntos: 3 = 3%
  commission_amount numeric(18,2),          -- comisión pactada en firme, si la hay

  -- El ingreso de la firma, no el precio del inmueble. Ver la nota 2
  -- de la cabecera. Manda la comisión en firme cuando existe; si no,
  -- el porcentaje sobre el valor.
  expected_revenue numeric(18,2) generated always as (
                     coalesce(commission_amount,
                       case when property_value is not null and commission_pct is not null
                            then round(property_value * commission_pct / 100, 2) end)) stored,

  probability_pct numeric(5,2) not null default 0
                  check (probability_pct >= 0 and probability_pct <= 100),

  -- El forecast ponderado. Se deriva por lo mismo que el precio/m² de
  -- un inmueble: si se escribiera a mano, quedaría viejo el día que
  -- alguien mueva la probabilidad y no el monto.
  --
  -- Repite la expresión de arriba en vez de multiplicar
  -- `expected_revenue` porque PostgreSQL no deja que una columna
  -- generada lea otra columna generada. No es copiar por descuido.
  weighted_revenue numeric(18,2) generated always as (
                     round(coalesce(commission_amount,
                       case when property_value is not null and commission_pct is not null
                            then property_value * commission_pct / 100 end, 0)
                       * probability_pct / 100, 2)) stored,

  expected_close_date date,
  closed_at           timestamptz,
  lost_reason         text,

  next_action      text,
  next_action_date date,

  notes      text,
  custom     jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint rei_deals_code_unico unique (company_id, code),
  constraint rei_deals_valor_positivo check (property_value is null or property_value >= 0),
  constraint rei_deals_comision_razonable check (commission_pct is null or (commission_pct >= 0 and commission_pct <= 100))
);
comment on table public.rei_deals is
  'Brokerage · la negociación. Cliente × inmueble × corredor, con el ingreso esperado de la FIRMA (la comisión) y su ponderación por probabilidad.';
comment on column public.rei_deals.expected_revenue is
  'La comisión, no el precio del inmueble: la firma intermedia. Derivado, nunca escrito a mano.';
comment on column public.rei_deals.weighted_revenue is
  'Ingreso esperado × probabilidad. Es el forecast, y por eso se deriva.';

create index if not exists rei_deals_empresa  on public.rei_deals(company_id) where deleted_at is null;
create index if not exists rei_deals_etapa    on public.rei_deals(company_id, stage) where deleted_at is null;
create index if not exists rei_deals_broker   on public.rei_deals(company_id, broker_id) where deleted_at is null;
create index if not exists rei_deals_proxima  on public.rei_deals(company_id, next_action_date) where deleted_at is null;
create index if not exists rei_deals_cierre   on public.rei_deals(company_id, expected_close_date) where deleted_at is null;
create index if not exists rei_deals_inmueble on public.rei_deals(property_id) where property_id is not null;

-- ---------- 3 · VISITAS ----------
-- La visita es el hecho que más información produce en todo el
-- proceso —es donde se sabe si el precio es real— y hoy no queda
-- registrada en ninguna parte. `interest_level` no es un adorno: con
-- veinte visitas de interés bajo sobre el mismo inmueble, el problema
-- es el precio y no el corredor.
create table if not exists public.rei_visits (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  code         text,                        -- VIS-2026-000001

  property_id  uuid not null references public.rei_properties(id) on delete cascade,
  lead_id      uuid references public.rei_leads(id)     on delete set null,
  deal_id      uuid references public.rei_deals(id)     on delete set null,
  customer_id  uuid references public.customers(id)     on delete set null,
  broker_id    uuid references auth.users(id)           on delete set null,

  scheduled_at timestamptz not null default now(),
  done_at      timestamptz,
  status       text not null default 'agendada'
               check (status in ('agendada','confirmada','realizada','no_asistio',
                                 'cancelada','reprogramada')),

  -- 1 a 5, como la escala de riesgos de CI. Lo llena el corredor al
  -- salir, en un segundo, y es lo que después explica una curva.
  interest_level int check (interest_level between 1 and 5),
  feedback     text,

  next_action      text,
  next_action_date date,

  notes      text,
  custom     jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint rei_visits_code_unico unique (company_id, code)
);
comment on table public.rei_visits is
  'Brokerage · las visitas a inmuebles. El hecho que más información produce del proceso: de aquí sale si el precio publicado es real.';

create index if not exists rei_visits_empresa  on public.rei_visits(company_id) where deleted_at is null;
create index if not exists rei_visits_agenda   on public.rei_visits(company_id, scheduled_at) where deleted_at is null;
create index if not exists rei_visits_inmueble on public.rei_visits(property_id) where deleted_at is null;
create index if not exists rei_visits_broker   on public.rei_visits(company_id, broker_id) where deleted_at is null;
create index if not exists rei_visits_lead     on public.rei_visits(lead_id) where lead_id is not null;

-- ---------- 4 · ACTIVIDADES ----------
-- La bitácora universal. Una llamada, un WhatsApp, una nota, una
-- tarea: todo cuelga de aquí, y por eso el historial de un cliente se
-- arma con una consulta y no con seis.
--
-- `due_date` + `done_at` hacen que la misma tabla sirva de registro
-- (lo que pasó) y de tarea (lo que falta). Separarlas habría obligado
-- a decidir, al anotar, si «llamar el martes» es una nota o una
-- tarea — y la respuesta es que es las dos.
create table if not exists public.rei_activities (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,

  kind         text not null default 'nota'
               check (kind in ('llamada','whatsapp','email','reunion','visita',
                               'tarea','nota','documento','seguimiento')),
  subject      text not null,
  detail       text,

  happened_at  timestamptz not null default now(),
  due_date     date,
  done_at      timestamptz,

  -- Los vínculos. Columnas de verdad y no (entidad, id): ver la nota
  -- 4 de la cabecera.
  customer_id    uuid references public.customers(id)         on delete cascade,
  lead_id        uuid references public.rei_leads(id)         on delete cascade,
  deal_id        uuid references public.rei_deals(id)         on delete cascade,
  property_id    uuid references public.rei_properties(id)    on delete cascade,
  visit_id       uuid references public.rei_visits(id)        on delete cascade,
  opportunity_id uuid references public.rei_opportunities(id) on delete cascade,
  development_id uuid references public.rei_developments(id)  on delete cascade,

  owner_id   uuid references auth.users(id) on delete set null,
  custom     jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
comment on table public.rei_activities is
  'Brokerage · la bitácora universal. Llamadas, mensajes, reuniones, notas y tareas de cualquier entidad del módulo.';
comment on column public.rei_activities.due_date is
  'Con fecha límite y sin done_at, la actividad ES una tarea pendiente. La misma tabla sirve de registro y de lista de pendientes a propósito.';

create index if not exists rei_activities_empresa  on public.rei_activities(company_id, happened_at desc) where deleted_at is null;
create index if not exists rei_activities_pendiente on public.rei_activities(company_id, due_date)
  where deleted_at is null and done_at is null;
create index if not exists rei_activities_cliente  on public.rei_activities(customer_id) where customer_id is not null;
create index if not exists rei_activities_lead     on public.rei_activities(lead_id)     where lead_id is not null;
create index if not exists rei_activities_deal     on public.rei_activities(deal_id)     where deal_id is not null;
create index if not exists rei_activities_inmueble on public.rei_activities(property_id) where property_id is not null;

-- ---------- 5 · CONTRATOS ----------
-- Arriendos, mandatos y administraciones. La razón de existir de esta
-- tabla es una sola columna: `end_date`. Un contrato de arriendo que
-- se vence sin que nadie lo vea es plata que se cae del mes siguiente,
-- y hoy eso vive en una carpeta.
create table if not exists public.rei_contracts (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  code          text,                       -- CTO-2026-000001
  name          text not null,

  contract_type text not null default 'arriendo'
                check (contract_type in ('arriendo','mandato','administracion',
                                         'corretaje','promesa','otro')),

  property_id       uuid references public.rei_properties(id) on delete set null,
  deal_id           uuid references public.rei_deals(id)      on delete set null,
  -- Las dos puntas. `customer_id` es el arrendatario o comprador;
  -- `owner_customer_id`, el propietario que encarga. Un mandato tiene
  -- solo la segunda, y está bien.
  customer_id       uuid references public.customers(id) on delete set null,
  owner_customer_id uuid references public.customers(id) on delete set null,
  broker_id         uuid references auth.users(id)       on delete set null,
  city              text,

  start_date    date,
  end_date      date,
  -- Con cuántos días de anticipación hay que avisar. Es lo que
  -- convierte «vence el 30» en «hay que decidir el 30 menos esto».
  notice_days   int not null default 30 check (notice_days >= 0),

  monthly_amount numeric(18,2),             -- canon o cuota
  admin_fee_pct  numeric(7,4),              -- lo que cobra la firma por administrar
  deposit        numeric(18,2),

  status        text not null default 'vigente'
                check (status in ('borrador','vigente','renovado','terminado',
                                  'incumplido','cancelado')),

  next_action      text,
  next_action_date date,

  notes      text,
  custom     jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint rei_contracts_code_unico unique (company_id, code),
  constraint rei_contracts_fechas_coherentes
    check (start_date is null or end_date is null or end_date >= start_date)
);
comment on table public.rei_contracts is
  'Brokerage · contratos de arriendo, mandato y administración. Existe por end_date: un vencimiento que nadie ve es ingreso que se cae del mes siguiente.';

create index if not exists rei_contracts_empresa on public.rei_contracts(company_id) where deleted_at is null;
create index if not exists rei_contracts_vence   on public.rei_contracts(company_id, end_date)
  where deleted_at is null and status in ('vigente','renovado');
create index if not exists rei_contracts_inmueble on public.rei_contracts(property_id) where property_id is not null;

-- ---------- 6 · METAS ----------
-- Una fila es «cuánto tiene que hacer ALGUIEN de ALGO en un MES».
-- Las tres dimensiones son opcionales hacia arriba: sin `user_id` la
-- meta es de la oficina, sin `city` es de la empresa entera. Así el
-- mismo modelo sostiene los cuatro niveles del documento —empresa,
-- ciudad, unidad, persona— sin cuatro tablas.
create table if not exists public.rei_targets (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,

  user_id      uuid references auth.users(id) on delete cascade,
  city         text,
  -- Siempre el día 1. Lo normaliza el trigger: una meta cargada el 17
  -- es la meta de ese mes, no una meta que empieza el 17.
  period_month date not null,

  metric       text not null
               check (metric in ('captaciones','leads','visitas','cierres',
                                 'comision','ingresos','contratos')),
  target_value numeric(18,2) not null default 0 check (target_value >= 0),

  notes      text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
comment on table public.rei_targets is
  'Brokerage · metas mensuales. Sin user_id la meta es de la ciudad; sin city, de la empresa. Los cuatro niveles del mismo modelo.';

-- El unique no puede ser una constraint normal: en PostgreSQL dos
-- filas con null en la misma columna NO chocan, así que «la meta de
-- comisión de Pamplona en marzo» se podría cargar quince veces. Con
-- los coalesce a un centinela, choca como debe.
create unique index if not exists rei_targets_unica
  on public.rei_targets (company_id,
                         coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
                         coalesce(city, ''), period_month, metric)
  where deleted_at is null;
create index if not exists rei_targets_periodo on public.rei_targets(company_id, period_month) where deleted_at is null;


-- ===========================================================
-- TRIGGERS
-- ===========================================================

-- ---------- updated_at ----------
do $$
declare t text;
begin
  foreach t in array array['rei_leads','rei_deals','rei_visits','rei_activities',
                           'rei_contracts','rei_targets'] loop
    execute format('drop trigger if exists %I on public.%I', t||'_touch', t);
    execute format('create trigger %I before update on public.%I
                    for each row execute function public.touch_updated_at()', t||'_touch', t);
  end loop;
end $$;

-- ---------- campos propios ----------
-- `rei_targets` queda fuera: una meta es un número y un mes, y no hay
-- nada que una empresa quiera agregarle que no sea otra métrica.
do $$
declare t text;
begin
  foreach t in array array['rei_leads','rei_deals','rei_visits','rei_activities','rei_contracts'] loop
    execute format('drop trigger if exists %I on public.%I', t||'_validate_custom', t);
    execute format('create trigger %I before insert or update of custom on public.%I
                    for each row execute function public.trg_validate_custom()', t||'_validate_custom', t);
  end loop;
end $$;

-- ---------- códigos ----------
drop trigger if exists rei_leads_code on public.rei_leads;
create trigger rei_leads_code before insert on public.rei_leads
  for each row execute function public.rei_codigo('LEAD');

drop trigger if exists rei_deals_code on public.rei_deals;
create trigger rei_deals_code before insert on public.rei_deals
  for each row execute function public.rei_codigo('NEG');

drop trigger if exists rei_visits_code on public.rei_visits;
create trigger rei_visits_code before insert on public.rei_visits
  for each row execute function public.rei_codigo('VIS');

drop trigger if exists rei_contracts_code on public.rei_contracts;
create trigger rei_contracts_code before insert on public.rei_contracts
  for each row execute function public.rei_codigo('CTO');

-- ---------- la fecha de cada etapa ----------
-- El corazón de la nota 1. Cuando la etapa cambia, se estampa la
-- columna de esa etapa SI ESTÁ VACÍA. Volver a una etapa anterior no
-- reescribe su fecha: la primera vez que se alcanzó es el dato que
-- sirve, y el retroceso ya queda en el log de auditoría.
--
-- `first_contact_at` es la excepción por arriba: se pone en cuanto el
-- lead sale de «nuevo», por cualquier camino, porque el tiempo de
-- primera respuesta es la métrica que más cierra ventas y no se puede
-- depender de que alguien pase por «contactado» en vez de saltar
-- directo a «visita agendada».
create or replace function public.rei_sellar_etapa_lead()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  -- OLD solo existe en UPDATE, y PostgreSQL no garantiza que un `and`
  -- corte antes de evaluar la segunda mitad: la comprobación va anidada.
  if tg_op = 'UPDATE' then
    if new.stage is not distinct from old.stage then return new; end if;
  end if;

  if new.stage <> 'nuevo' and new.first_contact_at is null then
    new.first_contact_at := now();
  end if;

  case new.stage
    when 'contactado'      then new.contacted_at       := coalesce(new.contacted_at, now());
    when 'calificado'      then new.qualified_at       := coalesce(new.qualified_at, now());
    when 'con_inmueble'    then new.matched_at         := coalesce(new.matched_at, now());
    when 'visita_agendada' then new.visit_scheduled_at := coalesce(new.visit_scheduled_at, now());
    when 'visita_hecha'    then new.visit_done_at      := coalesce(new.visit_done_at, now());
    when 'oferta'          then new.offer_at           := coalesce(new.offer_at, now());
    when 'negociacion'     then new.negotiation_at     := coalesce(new.negotiation_at, now());
    when 'ganado'          then new.won_at             := coalesce(new.won_at, now());
    when 'perdido'         then new.lost_at            := coalesce(new.lost_at, now());
    else null;
  end case;

  -- Un lead cerrado no tiene próxima acción: dejarla puesta lo haría
  -- aparecer para siempre en la lista de pendientes de alguien.
  if new.stage in ('ganado','perdido') then
    new.next_action := null;
    new.next_action_date := null;
  end if;

  return new;
end $$;
revoke execute on function public.rei_sellar_etapa_lead() from public, anon, authenticated;

drop trigger if exists rei_leads_sellar_etapa on public.rei_leads;
create trigger rei_leads_sellar_etapa before insert or update of stage on public.rei_leads
  for each row execute function public.rei_sellar_etapa_lead();

-- Lo mismo, más corto, para la negociación: solo interesa cuándo se
-- cerró y de qué lado.
create or replace function public.rei_sellar_cierre_deal()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' then
    if new.stage is not distinct from old.stage then return new; end if;
  end if;
  if new.stage in ('ganado','perdido') then
    new.closed_at := coalesce(new.closed_at, now());
    new.next_action := null;
    new.next_action_date := null;
    -- Ganada es 100% y perdida 0%: dejar una negociación cerrada con
    -- 40% de probabilidad metería un fantasma en el forecast.
    new.probability_pct := case when new.stage = 'ganado' then 100 else 0 end;
  end if;
  return new;
end $$;
revoke execute on function public.rei_sellar_cierre_deal() from public, anon, authenticated;

drop trigger if exists rei_deals_sellar_cierre on public.rei_deals;
create trigger rei_deals_sellar_cierre before insert or update of stage on public.rei_deals
  for each row execute function public.rei_sellar_cierre_deal();

-- La visita realizada también se sella sola.
create or replace function public.rei_sellar_visita()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.status = 'realizada' and new.done_at is null then
    new.done_at := now();
  end if;
  return new;
end $$;
revoke execute on function public.rei_sellar_visita() from public, anon, authenticated;

drop trigger if exists rei_visits_sellar on public.rei_visits;
create trigger rei_visits_sellar before insert or update of status on public.rei_visits
  for each row execute function public.rei_sellar_visita();

-- ---------- el mes de una meta es un mes ----------
-- El mismo criterio que 0104 aplicó a la ejecución de CI: una fecha
-- cualquiera dentro del mes ES ese mes. Sin esto, dos metas del mismo
-- marzo cargadas el 1 y el 17 son dos filas y el unique no las ve.
create or replace function public.rei_normalizar_mes_meta()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.period_month := date_trunc('month', new.period_month)::date;
  return new;
end $$;
revoke execute on function public.rei_normalizar_mes_meta() from public, anon, authenticated;

drop trigger if exists rei_targets_mes on public.rei_targets;
create trigger rei_targets_mes before insert or update of period_month on public.rei_targets
  for each row execute function public.rei_normalizar_mes_meta();

-- ---------- coherencia entre empresas ----------
-- La misma aduana de 0120. Cada FK que cruza a otra tabla del módulo
-- pasa por aquí: dos filas pueden tener cada una su company_id
-- correcto y estar apuntándose entre organizaciones distintas, y eso
-- RLS no lo ve.
do $$
declare r record;
begin
  for r in
    select * from (values
      ('rei_leads',      'rei_buyers',        'buyer_id'),
      ('rei_leads',      'rei_properties',    'property_id'),
      ('rei_leads',      'customers',         'customer_id'),
      ('rei_deals',      'rei_leads',         'lead_id'),
      ('rei_deals',      'rei_properties',    'property_id'),
      ('rei_deals',      'customers',         'customer_id'),
      ('rei_visits',     'rei_properties',    'property_id'),
      ('rei_visits',     'rei_leads',         'lead_id'),
      ('rei_visits',     'rei_deals',         'deal_id'),
      ('rei_visits',     'customers',         'customer_id'),
      ('rei_contracts',  'rei_properties',    'property_id'),
      ('rei_contracts',  'rei_deals',         'deal_id'),
      ('rei_contracts',  'customers',         'customer_id'),
      ('rei_activities', 'customers',         'customer_id'),
      ('rei_activities', 'rei_leads',         'lead_id'),
      ('rei_activities', 'rei_deals',         'deal_id'),
      ('rei_activities', 'rei_properties',    'property_id'),
      ('rei_activities', 'rei_visits',        'visit_id'),
      ('rei_activities', 'rei_opportunities', 'opportunity_id'),
      ('rei_activities', 'rei_developments',  'development_id')
    ) as t(tabla, apunta_a, columna)
  loop
    execute format('drop trigger if exists %I on public.%I',
                   r.tabla||'_empresa_'||r.columna, r.tabla);
    execute format('create trigger %I before insert or update of %I on public.%I
                    for each row when (new.%I is not null)
                    execute function public.ci_misma_empresa(%L, %L)',
                   r.tabla||'_empresa_'||r.columna, r.columna, r.tabla,
                   r.columna, r.apunta_a, r.columna);
  end loop;
end $$;

-- `rei_contracts.owner_customer_id` va aparte: es la segunda FK a
-- `customers` de la misma tabla y el nombre del trigger se deriva de
-- la columna, no de la tabla apuntada.
drop trigger if exists rei_contracts_empresa_owner_customer_id on public.rei_contracts;
create trigger rei_contracts_empresa_owner_customer_id
  before insert or update of owner_customer_id on public.rei_contracts
  for each row when (new.owner_customer_id is not null)
  execute function public.ci_misma_empresa('customers', 'owner_customer_id');

-- ---------- el responsable trabaja aquí ----------
-- Un `broker_id` que no es miembro de la empresa no es un error de
-- tipo: es una meta que nunca va a compararse contra nada, porque el
-- panel agrupa por miembro. Se corta al escribir.
create or replace function public.rei_broker_es_miembro()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_col text := tg_argv[0]; v_user uuid;
begin
  v_user := (to_jsonb(new) ->> v_col)::uuid;
  if v_user is null then return new; end if;
  if not exists (select 1 from public.company_members m
                  where m.company_id = new.company_id and m.user_id = v_user
                    and m.status <> 'suspended') then
    raise exception 'Esa persona no es miembro activo de la organización';
  end if;
  return new;
end $$;
revoke execute on function public.rei_broker_es_miembro() from public, anon, authenticated;

do $$
declare r record;
begin
  for r in
    select * from (values
      ('rei_leads',      'broker_id'),
      ('rei_deals',      'broker_id'),
      ('rei_visits',     'broker_id'),
      ('rei_contracts',  'broker_id'),
      ('rei_activities', 'owner_id'),
      ('rei_targets',    'user_id')
    ) as t(tabla, columna)
  loop
    execute format('drop trigger if exists %I on public.%I',
                   r.tabla||'_miembro', r.tabla);
    execute format('create trigger %I before insert or update of %I on public.%I
                    for each row when (new.%I is not null)
                    execute function public.rei_broker_es_miembro(%L)',
                   r.tabla||'_miembro', r.columna, r.tabla, r.columna, r.columna);
  end loop;
end $$;
