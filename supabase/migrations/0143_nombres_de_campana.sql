-- =====================================================================
-- 0143 · Nombres propios para las campañas (Centro de clientes)
--
-- Meta nombra las campañas como quiere («Clientes potenciales · Murales
-- Oct 2026 – Copia»). El Alma les pone el suyo («Murales octubre») y el
-- filtro, las fichas y la búsqueda usan ese. Dos campañas con el mismo
-- nombre propio se ven como una sola. El nombre original no se toca.
-- =====================================================================

create table if not exists public.lead_campaign_names (
  alma_id       uuid not null references public.almas(id) on delete cascade,
  campaign_name text not null,                 -- tal como llega de Meta
  alias         text not null check (length(btrim(alias)) between 1 and 80),
  updated_at    timestamptz not null default now(),
  primary key (alma_id, campaign_name)
);

alter table public.lead_campaign_names enable row level security;

drop policy if exists lead_campaign_names_own on public.lead_campaign_names;
create policy lead_campaign_names_own on public.lead_campaign_names
  for all to authenticated
  using ((select public.owns_alma(alma_id))) with check ((select public.owns_alma(alma_id)));

grant select, insert, update, delete on public.lead_campaign_names to authenticated;

comment on table public.lead_campaign_names is
  'Nombre propio que el Alma le da a cada campaña de Meta en el Centro de clientes.';
