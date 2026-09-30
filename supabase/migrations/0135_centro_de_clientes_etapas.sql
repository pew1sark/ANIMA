-- 0135 · Centro de clientes: etapas como el Centro de clientes potenciales de Meta.
-- Nuevo → Por responder (revisado) → Contactado → Cotizado → Ganado · Descartado.
-- Se agregan `cotizado` y `ganado`, más la fecha en que se llegó a cada una.
alter table public.client_leads drop constraint if exists client_leads_status_check;
alter table public.client_leads add constraint client_leads_status_check
  check (status in ('nuevo','revisado','contactado','cotizado','ganado','descartado'));

alter table public.client_leads add column if not exists quoted_at timestamptz;
alter table public.client_leads add column if not exists won_at    timestamptz;
