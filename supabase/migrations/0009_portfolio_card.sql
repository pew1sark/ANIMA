-- ===========================================================
-- ANIMA TSC — Migración 0009: Tarjeta de información del portafolio
--
-- Da a cada Alma una "tarjeta" tipo Behance para su portafolio público:
--   · headline      → titular corto ("Artista visual · Muralista")
--   · availability  → disponibilidad para trabajar (texto libre / estado)
--
-- El interruptor "portafolio público" vive en almas.visibility->>'public'
-- (JSON ya existente), no necesita columna.
--
-- CÓMO APLICAR:
--   Supabase → SQL Editor → New query → pega TODO → Run.  (Idempotente)
-- ===========================================================

alter table public.almas add column if not exists headline     text;
alter table public.almas add column if not exists availability  text;

-- Fin 0009.
