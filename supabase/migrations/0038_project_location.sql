-- 0038 · Ubicación de cada trabajo (Ciudad, Comuna)
--
-- Permite mapear dónde está cada cotización / mural en el Flujo de trabajo,
-- con filtro por comuna. El cargador de módulos (assets/js/supabase.js ·
-- MODULE_FIELDS.projects) hace SELECT con columnas explícitas: si estas
-- columnas faltan, TODA la consulta de proyectos falla.
-- Aplicar ANTES de desplegar el JS que las usa.
--
-- CÓMO APLICAR (si no usas MCP/CLI):
--   Supabase → SQL Editor → New query → pega este archivo → Run.

alter table public.projects add column if not exists city   text;
alter table public.projects add column if not exists comuna text;
