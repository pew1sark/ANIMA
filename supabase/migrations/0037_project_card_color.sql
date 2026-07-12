-- 0037 · Color personalizado de la tarjeta de cada proyecto
--
-- El Taller permite asignar un color a cada proyecto (tarjetas, lista y
-- kanban) para encontrarlo de un vistazo. El cargador de módulos
-- (assets/js/supabase.js · MODULE_FIELDS.projects) hace SELECT con columnas
-- explícitas: si esta columna falta, TODA la consulta de proyectos falla.
-- Aplicar ANTES de desplegar el JS que la usa.
--
-- CÓMO APLICAR (si no usas MCP/CLI):
--   Supabase → SQL Editor → New query → pega este archivo → Run.

alter table public.projects add column if not exists color text;
