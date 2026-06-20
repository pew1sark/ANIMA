-- ===========================================================
-- ANIMA TSC — Migración 0010: Chispas (los "me gusta" de ANIMA)
--
-- Cada Alma acumula CHISPAS: el aprecio del mundo a su trabajo.
-- Cualquier visitante del portafolio público puede dar una Chispa.
--   · almas.sparks            → contador de Chispas
--   · public.give_spark(uuid) → suma una Chispa de forma segura
--     (security definer: permite sumar sin abrir UPDATE de almas a todos)
--
-- El control de "una por visitante" se hace en el cliente (localStorage),
-- fiel a la simpleza de la Founding Era.
--
-- CÓMO APLICAR:
--   Supabase → SQL Editor → New query → pega TODO → Run.  (Idempotente)
-- ===========================================================

alter table public.almas add column if not exists sparks integer not null default 0;

create or replace function public.give_spark(p_alma uuid)
returns integer
language sql
security definer
set search_path = ''
as $$
  update public.almas
     set sparks = coalesce(sparks, 0) + 1
   where id = p_alma
  returning sparks;
$$;

grant execute on function public.give_spark(uuid) to anon, authenticated;

-- Fin 0010.
