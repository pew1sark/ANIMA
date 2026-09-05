-- ===========================================================
-- 0097 · CAPITAL INTELLIGENCE — el modelo financiero
-- -----------------------------------------------------------
-- Cómo se guarda una proyección, y por qué así.
--
--   escenario → modelo (versión) → línea → período
--
-- ESCENARIO es el supuesto: conservador, base, optimista. MODELO es
-- una VERSIÓN de ese escenario, con fecha y autor. LÍNEA es un
-- concepto —"membresías", "arriendo", "equipamiento de cocina"—.
-- PERÍODO es la celda: lo que esa línea vale en marzo.
--
-- La versión no es burocracia. El brief lo pide de frente: nunca
-- sobrescribir silenciosamente una proyección anterior. Validar un
-- modelo lo congela —un trigger bloquea la escritura— y trabajar
-- otra vez exige `ci_nueva_version()`, que lo clona. Así "la cifra
-- que le mostramos al inversionista en agosto" sigue existiendo en
-- diciembre, tal cual era.
--
-- La celda se guarda calculada, no derivada al vuelo: un modelo
-- editado a mano en tres meses concretos deja de ser una fórmula,
-- y `source` dice cuál es cuál ('formula' o 'manual').
--
-- Los importes REALES viven aparte, en ci_actuals. Mezclarlos con
-- lo proyectado en la misma tabla es exactamente el error que este
-- módulo existe para evitar.
-- ===========================================================

-- ---------- ESCENARIOS ----------
create table if not exists public.ci_scenarios (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id)   on delete cascade,
  project_id  uuid not null references public.ci_projects(id) on delete cascade,
  name        text not null,
  kind        text not null default 'base'
              check (kind in ('conservador','base','optimista','personalizado')),
  is_default  boolean not null default false,
  -- Las palancas del escenario: volumen, precio, crecimiento, COGS,
  -- laborales, CAPEX, gastos, fecha de lanzamiento, conversión,
  -- churn, tipo de cambio. Se guardan como jsonb porque cada
  -- negocio mueve unas distintas y ninguna lista fija las cubre.
  assumptions jsonb not null default '{}'::jsonb,
  notes       text,
  custom      jsonb not null default '{}'::jsonb,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
comment on table public.ci_scenarios is
  'Capital Intelligence · un juego de supuestos sobre un proyecto.';

-- ---------- MODELOS (versiones) ----------
create table if not exists public.ci_models (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id)    on delete cascade,
  project_id    uuid not null references public.ci_projects(id)  on delete cascade,
  scenario_id   uuid not null references public.ci_scenarios(id) on delete cascade,
  version       int  not null default 1,
  label         text,
  currency      text not null default 'USD',
  period_start  date not null,
  period_months int  not null default 36 check (period_months between 1 and 240),

  -- Sin saldo inicial no hay flujo de caja honesto. Se deja nulo a
  -- propósito: nulo significa "no lo han dicho" y la validación lo
  -- reclama, mientras que un 0 por defecto mentiría en silencio.
  opening_cash      numeric(18,2),
  -- Sin tasa no hay VAN. Misma lógica.
  discount_rate_pct numeric(7,4),
  tax_rate_pct      numeric(7,4),

  state         text not null default 'borrador'
                check (state in ('borrador','validado','archivado')),
  validated_by  uuid references auth.users(id) on delete set null,
  validated_at  timestamptz,
  notes         text,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  unique (scenario_id, version)
);
comment on table public.ci_models is
  'Capital Intelligence · una VERSIÓN de la proyección de un escenario. Validarla la congela.';

-- ---------- LÍNEAS ----------
create table if not exists public.ci_model_lines (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id)        on delete cascade,
  project_id       uuid not null references public.ci_projects(id)      on delete cascade,
  model_id         uuid not null references public.ci_models(id)        on delete cascade,
  business_unit_id uuid references public.ci_business_units(id)         on delete set null,

  kind     text not null check (kind in
             ('ingreso','costo_directo','gasto_operativo','depreciacion','inversion')),
  category text not null default 'otros',
  name     text not null,

  -- De dónde sale el número de cada mes:
  --   cantidad_precio · cantidad × precio, creciendo growth_pct
  --   monto           · un importe fijo por período
  --   pct_ingresos    · un % de los ingresos del mismo período
  driver     text not null default 'monto'
             check (driver in ('cantidad_precio','monto','pct_ingresos')),
  quantity   numeric(18,4),
  unit_price numeric(18,4),
  amount     numeric(18,2),
  pct        numeric(7,4),
  growth_pct numeric(7,4) not null default 0,
  frequency  text not null default 'mensual'
             check (frequency in ('mensual','anual','unica')),
  -- Para inversión: en qué mes del horizonte ocurre (0 = mes de inicio).
  start_offset int not null default 0,

  notes  text,
  sort   int not null default 0,
  custom jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.ci_model_lines is
  'Capital Intelligence · un concepto del modelo: ingreso, costo, gasto, depreciación o inversión.';

-- ---------- PERÍODOS (la matriz) ----------
create table if not exists public.ci_model_periods (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id)          on delete cascade,
  project_id uuid not null references public.ci_projects(id)        on delete cascade,
  model_id   uuid not null references public.ci_models(id)          on delete cascade,
  line_id    uuid not null references public.ci_model_lines(id)     on delete cascade,
  period     date not null,                       -- siempre día 1 del mes
  planned_amount numeric(18,2) not null default 0,
  quantity       numeric(18,4),
  unit_price     numeric(18,4),
  source     text not null default 'formula' check (source in ('formula','manual')),
  note       text,
  updated_at timestamptz not null default now(),
  unique (line_id, period),
  constraint ci_model_periods_dia_uno check (extract(day from period) = 1)
);
comment on table public.ci_model_periods is
  'Capital Intelligence · la celda del modelo. `source` distingue lo que puso la fórmula de lo que corrigió una persona.';

-- ---------- EJECUCIÓN REAL ----------
create table if not exists public.ci_actuals (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id)       on delete cascade,
  project_id       uuid not null references public.ci_projects(id)     on delete cascade,
  business_unit_id uuid references public.ci_business_units(id)        on delete set null,
  -- Contra qué línea del presupuesto se compara. Puede faltar: un
  -- gasto real que nadie presupuestó también es información.
  line_id  uuid references public.ci_model_lines(id) on delete set null,

  period   date not null,
  kind     text not null check (kind in
             ('ingreso','costo_directo','gasto_operativo','depreciacion','inversion')),
  category text not null default 'otros',
  concept  text,

  committed_amount numeric(18,2) not null default 0,
  paid_amount      numeric(18,2) not null default 0,
  actual_amount    numeric(18,2) not null default 0,

  -- Multimoneda: se conserva lo original Y lo convertido, con la
  -- tasa y su fecha. Cambiar la tasa de hoy no puede mover una
  -- cifra de marzo: por eso el convertido se guarda, no se deriva.
  currency    text not null default 'USD',
  fx_rate     numeric(18,8),
  fx_date     date,
  base_amount numeric(18,2),

  supplier     text,
  evidence_url text,
  milestone_id uuid references public.ci_milestones(id) on delete set null,
  note   text,
  custom jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ci_actuals_dia_uno check (extract(day from period) = 1)
);
comment on table public.ci_actuals is
  'Capital Intelligence · lo que de verdad pasó, mes a mes. Separado de lo proyectado a propósito.';

-- ---------- TIPOS DE CAMBIO ----------
create table if not exists public.ci_exchange_rates (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  base_currency  text not null,
  quote_currency text not null,
  rate           numeric(18,8) not null check (rate > 0),
  rate_date      date not null,
  source         text,
  created_at     timestamptz not null default now(),
  unique (company_id, base_currency, quote_currency, rate_date)
);
comment on table public.ci_exchange_rates is
  'Capital Intelligence · 1 base_currency = rate quote_currency, en esa fecha.';

-- ---------- UMBRALES DEL SEMÁFORO ----------
create table if not exists public.ci_thresholds (
  company_id   uuid not null references public.companies(id) on delete cascade,
  kind         text not null default 'general',
  warn_pct     numeric(7,4) not null default 10,
  critical_pct numeric(7,4) not null default 20,
  updated_at   timestamptz not null default now(),
  primary key (company_id, kind)
);
comment on table public.ci_thresholds is
  'Capital Intelligence · desde qué desviación el semáforo pasa a amarillo y a rojo. Por organización, como pide el brief.';

-- ---------- ÍNDICES ----------
create index if not exists ci_scenarios_company_idx     on public.ci_scenarios(company_id);
create index if not exists ci_scenarios_project_idx     on public.ci_scenarios(project_id) where deleted_at is null;
create index if not exists ci_models_company_idx        on public.ci_models(company_id);
create index if not exists ci_models_project_idx        on public.ci_models(project_id) where deleted_at is null;
create index if not exists ci_models_scenario_idx       on public.ci_models(scenario_id);
create index if not exists ci_model_lines_company_idx   on public.ci_model_lines(company_id);
create index if not exists ci_model_lines_project_idx   on public.ci_model_lines(project_id);
create index if not exists ci_model_lines_model_idx     on public.ci_model_lines(model_id, sort);
create index if not exists ci_model_lines_unit_idx      on public.ci_model_lines(business_unit_id);
create index if not exists ci_model_periods_company_idx on public.ci_model_periods(company_id);
create index if not exists ci_model_periods_project_idx on public.ci_model_periods(project_id);
create index if not exists ci_model_periods_model_idx   on public.ci_model_periods(model_id, period);
create index if not exists ci_model_periods_line_idx    on public.ci_model_periods(line_id);
create index if not exists ci_actuals_company_idx       on public.ci_actuals(company_id);
create index if not exists ci_actuals_project_idx       on public.ci_actuals(project_id, period);
create index if not exists ci_actuals_unit_idx          on public.ci_actuals(business_unit_id);
create index if not exists ci_actuals_line_idx          on public.ci_actuals(line_id);
create index if not exists ci_actuals_milestone_idx     on public.ci_actuals(milestone_id);
create index if not exists ci_exchange_rates_company_idx on public.ci_exchange_rates(company_id, base_currency, quote_currency, rate_date desc);

-- ---------- updated_at ----------
do $$
declare t text;
begin
  foreach t in array array['ci_scenarios','ci_models','ci_model_lines',
                           'ci_model_periods','ci_actuals','ci_thresholds'] loop
    execute format('drop trigger if exists %I on public.%I', t||'_touch', t);
    execute format('create trigger %I before update on public.%I
                    for each row execute function public.touch_updated_at()', t||'_touch', t);
  end loop;
end $$;

-- ---------- campos propios ----------
do $$
declare t text;
begin
  foreach t in array array['ci_scenarios','ci_model_lines','ci_actuals'] loop
    execute format('drop trigger if exists %I on public.%I', t||'_validate_custom', t);
    execute format('create trigger %I before insert or update of custom on public.%I
                    for each row execute function public.trg_validate_custom()', t||'_validate_custom', t);
  end loop;
end $$;

-- ---------- borrado lógico ----------
do $$
declare t text;
begin
  foreach t in array array['ci_scenarios','ci_models'] loop
    execute format('drop trigger if exists %I on public.%I', t||'_soft_delete', t);
    execute format('create trigger %I before delete on public.%I
                    for each row execute function public.ci_borrado_logico()', t||'_soft_delete', t);
  end loop;
end $$;

-- ---------- coherencia entre niveles ----------
drop trigger if exists ci_scenarios_misma_empresa on public.ci_scenarios;
create trigger ci_scenarios_misma_empresa before insert or update of project_id on public.ci_scenarios
  for each row execute function public.ci_misma_empresa('ci_projects', 'project_id');

drop trigger if exists ci_models_misma_empresa on public.ci_models;
create trigger ci_models_misma_empresa before insert or update of scenario_id on public.ci_models
  for each row execute function public.ci_misma_empresa('ci_scenarios', 'scenario_id');

drop trigger if exists ci_model_lines_misma_empresa on public.ci_model_lines;
create trigger ci_model_lines_misma_empresa before insert or update of model_id on public.ci_model_lines
  for each row execute function public.ci_misma_empresa('ci_models', 'model_id');

drop trigger if exists ci_model_periods_misma_empresa on public.ci_model_periods;
create trigger ci_model_periods_misma_empresa before insert or update of line_id on public.ci_model_periods
  for each row execute function public.ci_misma_empresa('ci_model_lines', 'line_id');

drop trigger if exists ci_actuals_misma_empresa on public.ci_actuals;
create trigger ci_actuals_misma_empresa before insert or update of project_id on public.ci_actuals
  for each row execute function public.ci_misma_empresa('ci_projects', 'project_id');

-- ---------- UN MODELO VALIDADO NO SE TOCA ----------
-- Es la garantía de "nunca sobrescribir silenciosamente". No es una
-- convención ni un aviso en pantalla: la base lo rechaza.
create or replace function public.ci_modelo_congelado()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_state text; v_model uuid;
begin
  if tg_op = 'DELETE' then v_model := old.model_id; else v_model := new.model_id; end if;
  select state into v_state from public.ci_models where id = v_model;
  if v_state = 'validado' then
    raise exception 'Este modelo está validado. Crea una versión nueva para cambiarlo.'
      using hint = 'Usa ci_nueva_version() para seguir trabajando sin perder lo aprobado.';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;
revoke execute on function public.ci_modelo_congelado() from public, anon, authenticated;

drop trigger if exists ci_model_lines_congelado on public.ci_model_lines;
create trigger ci_model_lines_congelado before insert or update or delete on public.ci_model_lines
  for each row execute function public.ci_modelo_congelado();

drop trigger if exists ci_model_periods_congelado on public.ci_model_periods;
create trigger ci_model_periods_congelado before insert or update or delete on public.ci_model_periods
  for each row execute function public.ci_modelo_congelado();

-- ---------- RLS ----------
alter table public.ci_scenarios      enable row level security;
alter table public.ci_models         enable row level security;
alter table public.ci_model_lines    enable row level security;
alter table public.ci_model_periods  enable row level security;
alter table public.ci_actuals        enable row level security;
alter table public.ci_exchange_rates enable row level security;
alter table public.ci_thresholds     enable row level security;

-- Todo lo que cuelga de un proyecto se rige por el proyecto. La
-- columna project_id está desnormalizada justamente para esto: que
-- la política no tenga que subir por dos joins en cada fila.
do $$
declare t text; v_borrado text;
begin
  foreach t in array array['ci_scenarios','ci_models','ci_model_lines',
                           'ci_model_periods','ci_actuals'] loop
    v_borrado := case when t in ('ci_scenarios','ci_models') then 'deleted_at is null and ' else '' end;

    execute format('drop policy if exists %I on public.%I', t||'_leer', t);
    execute format('drop policy if exists %I on public.%I', t||'_escribir', t);
    execute format('drop policy if exists %I on public.%I', t||'_editar', t);
    execute format('drop policy if exists %I on public.%I', t||'_borrar', t);

    execute format('create policy %I on public.%I for select to authenticated
      using (%s public.ci_ve_proyecto(project_id))', t||'_leer', t, v_borrado);
    execute format('create policy %I on public.%I for insert to authenticated
      with check (public.ci_edita_proyecto(project_id))', t||'_escribir', t);
    execute format('create policy %I on public.%I for update to authenticated
      using (public.ci_edita_proyecto(project_id))
      with check (public.ci_edita_proyecto(project_id))', t||'_editar', t);
    execute format('create policy %I on public.%I for delete to authenticated
      using (public.ci_edita_proyecto(project_id))', t||'_borrar', t);
  end loop;
end $$;

-- Tipos de cambio y umbrales son de la organización, no de un
-- proyecto: los lee cualquiera que pueda entrar al módulo y los
-- escribe quien administra.
drop policy if exists ci_exchange_rates_leer     on public.ci_exchange_rates;
drop policy if exists ci_exchange_rates_escribir on public.ci_exchange_rates;
create policy ci_exchange_rates_leer on public.ci_exchange_rates for select to authenticated
  using (public.has_company_level(company_id, 40));
create policy ci_exchange_rates_escribir on public.ci_exchange_rates for all to authenticated
  using (public.has_company_level(company_id, 60))
  with check (public.has_company_level(company_id, 60));

drop policy if exists ci_thresholds_leer     on public.ci_thresholds;
drop policy if exists ci_thresholds_escribir on public.ci_thresholds;
create policy ci_thresholds_leer on public.ci_thresholds for select to authenticated
  using (public.has_company_level(company_id, 40));
create policy ci_thresholds_escribir on public.ci_thresholds for all to authenticated
  using (public.has_company_level(company_id, 80))
  with check (public.has_company_level(company_id, 80));
