-- =====================================================================
-- 0146 · Marketing Machine (STUDIO → Taller)
-- El ciclo diario de los anuncios: investigar → producir → subir →
-- calificar → escalar. `mm_ideas` es el tablero (una fila por anuncio o
-- idea de anuncio) y `mm_daily` el ritual de cada día.
-- Cada Alma lee y escribe solo lo suyo (owns_alma, igual que meta_ads_*).
-- =====================================================================

create table if not exists public.mm_ideas (
  id          uuid primary key default gen_random_uuid(),
  alma_id     uuid not null references public.almas(id) on delete cascade,
  stage       text not null default 'investigar'
              check (stage in ('investigar','producir','subir','calificar','escalar','archivo')),
  title       text not null,
  angle       text,                         -- el gancho o ángulo del anuncio
  format      text,                         -- video, imagen, carrusel…
  region      text,                         -- todo Chile, Santiago, Concepción…
  hypothesis  text,                         -- qué esperamos que pase y por qué
  source      text,                         -- de dónde salió la idea (competencia, cliente…)
  notes       text,
  ad_id       text,                         -- anuncio de Meta enlazado (meta_ads_objects.object_id)
  verdict     text check (verdict in ('ganador','probando','apagar')),
  result      text,                         -- lo aprendido al calificar
  stage_at    timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists mm_ideas_alma_stage on public.mm_ideas (alma_id, stage);

create table if not exists public.mm_daily (
  alma_id   uuid not null references public.almas(id) on delete cascade,
  day       date not null,
  done      jsonb not null default '{}'::jsonb,   -- {"investigar":true,…}
  note      text,
  updated_at timestamptz not null default now(),
  primary key (alma_id, day)
);

alter table public.mm_ideas enable row level security;
alter table public.mm_daily enable row level security;

drop policy if exists mm_ideas_own on public.mm_ideas;
create policy mm_ideas_own on public.mm_ideas for all to authenticated
  using ((select public.owns_alma(alma_id))) with check ((select public.owns_alma(alma_id)));
drop policy if exists mm_daily_own on public.mm_daily;
create policy mm_daily_own on public.mm_daily for all to authenticated
  using ((select public.owns_alma(alma_id))) with check ((select public.owns_alma(alma_id)));

comment on table public.mm_ideas is 'Marketing Machine: tablero de ideas y anuncios por etapa del ciclo diario.';
comment on table public.mm_daily is 'Marketing Machine: ritual diario (qué etapas se hicieron cada día).';
