-- =====================================================================
-- 0144 · Lugares del mapa (Resumen del Taller y Núcleo)
--
-- La ubicación de un proyecto se escribe a mano («Stgo Centro»,
-- «Colina RM», «Teno»). El mapa la convierte en coordenadas una sola vez
-- y las guarda aquí, por Alma, para no volver a preguntarlas.
--   q      el texto normalizado que se buscó (sin tildes, minúsculas)
--   lat/lng null = se buscó y no se encontró (no se vuelve a intentar)
-- =====================================================================

create table if not exists public.geo_lugares (
  alma_id    uuid not null references public.almas(id) on delete cascade,
  q          text not null check (length(q) between 1 and 120),
  lat        double precision,
  lng        double precision,
  label      text,
  created_at timestamptz not null default now(),
  primary key (alma_id, q)
);

alter table public.geo_lugares enable row level security;

drop policy if exists geo_lugares_own on public.geo_lugares;
create policy geo_lugares_own on public.geo_lugares
  for all to authenticated
  using ((select public.owns_alma(alma_id))) with check ((select public.owns_alma(alma_id)));

grant select, insert, update, delete on public.geo_lugares to authenticated;

comment on table public.geo_lugares is
  'Coordenadas de las ubicaciones escritas en proyectos y solicitudes, para el mapa de Chile del Taller.';
