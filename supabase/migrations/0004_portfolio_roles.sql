-- ===========================================================
-- ANIMA TSC — Migración 0004: portafolio pro + roles
-- CÓMO APLICAR: Supabase → SQL Editor → pega TODO → Run. (Idempotente)
-- ===========================================================

-- Banner del portafolio y rol dentro de ANIMA
alter table public.almas add column if not exists banner_url text;
alter table public.almas add column if not exists crew_role text;  -- FOUNDING / CO-FOUNDING / rol asignado

-- Galería: varias fotos por obra + categoría/tema explícita
alter table public.portfolio add column if not exists images jsonb default '[]'::jsonb;
alter table public.portfolio add column if not exists category text;

-- (Opcional) Marca a las 10 fundadoras reales como CO-FOUNDING.
-- Ajusta o ejecuta manualmente según corresponda:
-- update public.almas set crew_role = 'CO-FOUNDING' where is_founding = false and crew_role is null;

-- Fin 0004.
