-- ===========================================================
-- ANIMA TSC — Migración 0035: campos de Proyecto de "Taller V2"
--
-- El rediseño Taller V2 (assets/js/anima.js) y el cargador de módulos
-- (assets/js/supabase.js · MODULE_FIELDS.projects) leen y escriben columnas
-- de la tabla projects que nunca se migraron a la base:
--   context, owner_type, owner, template, category, responsible, archive
--
-- Como el cargador hace un SELECT con columnas explícitas, la ausencia de
-- CUALQUIERA de estas columnas hacía fallar toda la consulta -> el Alma veía
-- CERO proyectos ("se perdieron"), aunque los datos siguen intactos.
--
-- Esta migración añade las columnas faltantes. Es idempotente
-- (add column if not exists): se puede correr más de una vez sin romper nada.
--
-- CÓMO APLICAR (si no usas MCP/CLI):
--   Supabase → SQL Editor → New query → pega TODO este archivo → Run.
-- ===========================================================

alter table public.projects add column if not exists context     text;
alter table public.projects add column if not exists owner_type  text;
alter table public.projects add column if not exists owner       text;
alter table public.projects add column if not exists template    text;
alter table public.projects add column if not exists category    text;
alter table public.projects add column if not exists responsible text;
alter table public.projects add column if not exists archive     text;
