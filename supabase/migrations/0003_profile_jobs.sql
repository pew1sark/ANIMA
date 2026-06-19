-- ===========================================================
-- ANIMA TSC — Migración 0003: perfil ampliado, foto, saldos
-- CÓMO APLICAR: Supabase → SQL Editor → pega TODO → Run. (Idempotente)
-- ===========================================================

-- Identidad ampliada del Alma (perfil tipo "Perfil del creador")
alter table public.almas add column if not exists avatar_url text;
alter table public.almas add column if not exists discipline text;     -- rama artística
alter table public.almas add column if not exists specialty text;      -- especialidad
alter table public.almas add column if not exists handle text;         -- alias público @
alter table public.almas add column if not exists territory text;      -- territorio (ciudad, país)
alter table public.almas add column if not exists website text;
alter table public.almas add column if not exists instagram text;
alter table public.almas add column if not exists portfolio_url text;
alter table public.almas add column if not exists shop_url text;
alter table public.almas add column if not exists links jsonb default '[]'::jsonb;
-- Qué muestra a la comunidad y qué no (vista pública configurable)
alter table public.almas add column if not exists visibility jsonb default '{}'::jsonb;

-- Trabajos: saldo/abono y entregables (para el Flujo de trabajo)
alter table public.projects add column if not exists paid bigint default 0;
alter table public.projects add column if not exists deliverables text;

-- Contactos / clientes: responsable y tipo
alter table public.clients add column if not exists responsable text;
alter table public.clients add column if not exists type text;

-- Fin 0003.
