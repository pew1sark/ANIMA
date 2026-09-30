-- =====================================================================
-- 0136 · Centro de clientes conectado al Taller
--
-- Una solicitud que se cotiza queda enlazada a su Unidad de Trabajo
-- (Proyectos) y a la cotización del Cotizador, además del Vínculo que ya
-- tenía (client_id). Así el recorrido anuncio → WhatsApp → cotización →
-- proyecto se lee desde cualquiera de las tres pantallas.
-- =====================================================================

alter table public.client_leads
  add column if not exists project_id uuid references public.projects(id) on delete set null,
  add column if not exists quote_id   uuid references public.quotes(id)   on delete set null;

create index if not exists client_leads_project on public.client_leads (project_id) where project_id is not null;
create index if not exists client_leads_quote   on public.client_leads (quote_id)   where quote_id   is not null;

comment on column public.client_leads.project_id is 'Unidad de Trabajo (projects) creada al cotizar la solicitud.';
comment on column public.client_leads.quote_id   is 'Cotización (quotes) enviada a esta solicitud.';
