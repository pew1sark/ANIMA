-- ===========================================================
-- 0115 · FASE 2 · el levantamiento de capital
-- -----------------------------------------------------------
-- Siete tablas que cuelgan del proyecto que ya existe. Ninguna repite
-- lo que la Fase 1 guarda: el proyecto sigue teniendo su capital
-- requerido y su valoración —son su ficha— y la RONDA es el proceso
-- por el que ese capital entra, con sus fechas, sus compromisos y su
-- reparto. Un proyecto puede tener varias rondas a lo largo del tiempo.
--
-- Dos decisiones de modelo que vale la pena dejar escritas:
--
-- 1 · LOS INVERSIONISTAS SON DE LA ORGANIZACIÓN, no del proyecto. El
--     mismo fondo puede mirar tres proyectos de la misma firma, y su
--     tesis y su ticket son los mismos en los tres. Lo que cambia por
--     proyecto es la ETAPA, y por eso vive en el compromiso: se puede
--     estar en due diligence de uno y sin contestar en otro.
--
-- 2 · EL NIVEL DE RIESGO ES UNA COLUMNA GENERADA, probabilidad ×
--     impacto. Una matriz de riesgos donde el nivel se escribe a mano
--     deja de ser una matriz y pasa a ser una opinión con tabla.
--
-- Y una consecuencia de seguridad: la lista de inversionistas de una
-- firma es, probablemente, lo más sensible que hay en toda la base.
-- Sus políticas exigen nivel de ORGANIZACIÓN y no permiso sobre un
-- proyecto, así que un inversionista invitado a ver SU proyecto no
-- puede ver quién más está en la mesa.
-- ===========================================================

create table if not exists public.ci_capital_rounds (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id)   on delete cascade,
  project_id   uuid not null references public.ci_projects(id) on delete cascade,
  name         text not null,
  currency     text not null default 'USD',
  target_amount numeric(18,2) not null default 0,
  open_date        date,
  target_close_date date,
  closed_date      date,
  instrument   text,
  equity_offered_pct numeric(7,4),
  pre_money    numeric(18,2),
  post_money   numeric(18,2),
  status       text not null default 'preparacion'
               check (status in ('preparacion','abierta','comprometida_parcial','cerrada','pausada','cancelada')),
  owner        text,
  use_of_funds_note text,
  notes        text,
  custom       jsonb not null default '{}'::jsonb,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  constraint ci_rounds_equity_rango check (equity_offered_pct is null
    or (equity_offered_pct >= 0 and equity_offered_pct <= 100))
);
comment on table public.ci_capital_rounds is
  'Capital Intelligence · una ronda de levantamiento. El proyecto guarda la ficha; la ronda guarda el proceso.';

create table if not exists public.ci_use_of_funds (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id)          on delete cascade,
  project_id   uuid not null references public.ci_projects(id)        on delete cascade,
  round_id     uuid not null references public.ci_capital_rounds(id)  on delete cascade,
  category     text not null,
  description  text,
  budget_amount    numeric(18,2) not null default 0,
  committed_amount numeric(18,2) not null default 0,
  used_amount      numeric(18,2) not null default 0,
  supplier     text,
  evidence_url text,
  milestone_id uuid references public.ci_milestones(id) on delete set null,
  spent_at     date,
  sort         int not null default 0,
  custom       jsonb not null default '{}'::jsonb,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.ci_use_of_funds is
  'Capital Intelligence · en qué se reparte el dinero de una ronda. La suma tiene que cuadrar con el objetivo o el sistema lo advierte.';

create table if not exists public.ci_investors (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  name         text not null,
  kind         text not null default 'persona',
  country      text,
  contact_name text,
  email        text,
  phone        text,
  thesis       text,
  sectors      text,
  ticket_min   numeric(18,2),
  ticket_max   numeric(18,2),
  currency     text not null default 'USD',
  owner        text,
  status       text not null default 'activo',
  notes        text,
  custom       jsonb not null default '{}'::jsonb,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
comment on table public.ci_investors is
  'Capital Intelligence · CRM de inversionistas de la firma. Uno solo puede estar en varias rondas.';

create table if not exists public.ci_investor_commitments (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id)         on delete cascade,
  project_id   uuid not null references public.ci_projects(id)       on delete cascade,
  round_id     uuid references public.ci_capital_rounds(id)          on delete cascade,
  investor_id  uuid not null references public.ci_investors(id)      on delete cascade,
  stage        text not null default 'identificado'
               check (stage in ('identificado','contactado','interesado','reunion',
                                'informacion_enviada','due_diligence','negociacion',
                                'comprometido','cerrado','no_interesado','en_pausa')),
  potential_amount  numeric(18,2) not null default 0,
  committed_amount  numeric(18,2) not null default 0,
  invested_amount   numeric(18,2) not null default 0,
  probability_pct   numeric(5,2) not null default 0
                    check (probability_pct >= 0 and probability_pct <= 100),
  currency     text not null default 'USD',
  last_contact date,
  next_action  text,
  next_action_date date,
  owner        text,
  notes        text,
  custom       jsonb not null default '{}'::jsonb,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (round_id, investor_id)
);
comment on table public.ci_investor_commitments is
  'Capital Intelligence · un inversionista dentro de una ronda: etapa, monto y probabilidad. El forecast ponderado sale de aquí.';

create table if not exists public.ci_investor_interactions (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id)      on delete cascade,
  investor_id  uuid not null references public.ci_investors(id)   on delete cascade,
  project_id   uuid references public.ci_projects(id)             on delete cascade,
  happened_at  date not null default current_date,
  kind         text not null default 'reunion',
  summary      text not null,
  outcome      text,
  next_action  text,
  next_action_date date,
  owner        text,
  custom       jsonb not null default '{}'::jsonb,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.ci_investor_interactions is
  'Capital Intelligence · qué se habló, cuándo y qué sigue. Es lo que evita que una ronda se caiga por silencio.';

create table if not exists public.ci_shareholders (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id)   on delete cascade,
  project_id   uuid not null references public.ci_projects(id) on delete cascade,
  name         text not null,
  kind         text not null default 'fundador',
  shares       numeric(18,4),
  pct          numeric(9,6),
  invested     numeric(18,2) not null default 0,
  currency     text not null default 'USD',
  rights       text,
  joined_at    date,
  investor_id  uuid references public.ci_investors(id) on delete set null,
  notes        text,
  sort         int not null default 0,
  custom       jsonb not null default '{}'::jsonb,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.ci_shareholders is
  'Capital Intelligence · quién tiene qué en el vehículo del proyecto, antes de la ronda.';

create table if not exists public.ci_risks (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id)   on delete cascade,
  project_id   uuid not null references public.ci_projects(id) on delete cascade,
  name         text not null,
  category     text not null default 'operacional',
  probability  int not null default 3 check (probability between 1 and 5),
  impact       int not null default 3 check (impact between 1 and 5),
  level        int generated always as (probability * impact) stored,
  owner        text,
  mitigation   text,
  review_date  date,
  status       text not null default 'abierto',
  notes        text,
  custom       jsonb not null default '{}'::jsonb,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
comment on table public.ci_risks is
  'Capital Intelligence · matriz de riesgos. El nivel se calcula (probabilidad × impacto), no se opina.';

create index if not exists ci_rounds_company_idx      on public.ci_capital_rounds(company_id) where deleted_at is null;
create index if not exists ci_rounds_project_idx      on public.ci_capital_rounds(project_id, status);
create index if not exists ci_uof_company_idx         on public.ci_use_of_funds(company_id);
create index if not exists ci_uof_round_idx           on public.ci_use_of_funds(round_id, sort);
create index if not exists ci_uof_project_idx         on public.ci_use_of_funds(project_id);
create index if not exists ci_uof_milestone_idx       on public.ci_use_of_funds(milestone_id);
create index if not exists ci_investors_company_idx   on public.ci_investors(company_id) where deleted_at is null;
create index if not exists ci_commit_company_idx      on public.ci_investor_commitments(company_id);
create index if not exists ci_commit_round_idx        on public.ci_investor_commitments(round_id, stage);
create index if not exists ci_commit_project_idx      on public.ci_investor_commitments(project_id);
create index if not exists ci_commit_investor_idx     on public.ci_investor_commitments(investor_id);
create index if not exists ci_inter_company_idx       on public.ci_investor_interactions(company_id);
create index if not exists ci_inter_investor_idx      on public.ci_investor_interactions(investor_id, happened_at desc);
create index if not exists ci_inter_project_idx       on public.ci_investor_interactions(project_id);
create index if not exists ci_shareholders_company_idx on public.ci_shareholders(company_id);
create index if not exists ci_shareholders_project_idx on public.ci_shareholders(project_id, sort);
create index if not exists ci_shareholders_investor_idx on public.ci_shareholders(investor_id);
create index if not exists ci_risks_company_idx       on public.ci_risks(company_id) where deleted_at is null;
create index if not exists ci_risks_project_idx       on public.ci_risks(project_id, level desc);

do $$
declare t text;
begin
  foreach t in array array['ci_capital_rounds','ci_use_of_funds','ci_investors',
                           'ci_investor_commitments','ci_investor_interactions',
                           'ci_shareholders','ci_risks'] loop
    execute format('drop trigger if exists %I on public.%I', t||'_touch', t);
    execute format('create trigger %I before update on public.%I
                    for each row execute function public.touch_updated_at()', t||'_touch', t);

    execute format('drop trigger if exists %I on public.%I', t||'_validate_custom', t);
    execute format('create trigger %I before insert or update of custom on public.%I
                    for each row execute function public.trg_validate_custom()', t||'_validate_custom', t);

    execute format('drop trigger if exists %I on public.%I', t||'_auditar', t);
    execute format('create trigger %I after insert or update or delete on public.%I
                    for each row execute function public.ci_auditar()', t||'_auditar', t);
  end loop;

  foreach t in array array['ci_capital_rounds','ci_investors','ci_risks'] loop
    execute format('drop trigger if exists %I on public.%I', t||'_soft_delete', t);
    execute format('create trigger %I before delete on public.%I
                    for each row execute function public.ci_borrado_logico()', t||'_soft_delete', t);
  end loop;
end $$;

do $$
declare r record;
begin
  for r in select * from (values
      ('ci_capital_rounds','ci_projects','project_id'),
      ('ci_use_of_funds','ci_capital_rounds','round_id'),
      ('ci_investor_commitments','ci_investors','investor_id'),
      ('ci_investor_interactions','ci_investors','investor_id'),
      ('ci_shareholders','ci_projects','project_id'),
      ('ci_risks','ci_projects','project_id')) as x(hija, padre, col)
  loop
    execute format('drop trigger if exists %I on public.%I', r.hija||'_misma_empresa', r.hija);
    execute format('create trigger %I before insert or update of %I on public.%I
                    for each row execute function public.ci_misma_empresa(%L, %L)',
                   r.hija||'_misma_empresa', r.col, r.hija, r.padre, r.col);
  end loop;
end $$;

alter table public.ci_capital_rounds        enable row level security;
alter table public.ci_use_of_funds          enable row level security;
alter table public.ci_investors             enable row level security;
alter table public.ci_investor_commitments  enable row level security;
alter table public.ci_investor_interactions enable row level security;
alter table public.ci_shareholders          enable row level security;
alter table public.ci_risks                 enable row level security;

do $$
declare t text; v_borrado text;
begin
  foreach t in array array['ci_capital_rounds','ci_use_of_funds','ci_investor_commitments',
                           'ci_shareholders','ci_risks'] loop
    v_borrado := case when t in ('ci_capital_rounds','ci_risks') then 'deleted_at is null and ' else '' end;
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

drop policy if exists ci_investors_leer     on public.ci_investors;
drop policy if exists ci_investors_escribir on public.ci_investors;
create policy ci_investors_leer on public.ci_investors for select to authenticated
  using (deleted_at is null and public.has_company_level(company_id, 60));
create policy ci_investors_escribir on public.ci_investors for all to authenticated
  using (public.has_company_level(company_id, 60))
  with check (public.has_company_level(company_id, 60));

drop policy if exists ci_inter_leer     on public.ci_investor_interactions;
drop policy if exists ci_inter_escribir on public.ci_investor_interactions;
create policy ci_inter_leer on public.ci_investor_interactions for select to authenticated
  using (public.has_company_level(company_id, 60));
create policy ci_inter_escribir on public.ci_investor_interactions for all to authenticated
  using (public.has_company_level(company_id, 60))
  with check (public.has_company_level(company_id, 60));
