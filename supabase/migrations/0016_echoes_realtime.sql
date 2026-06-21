-- ===========================================================
-- ANIMA TSC — Migración 0016: Ecos en tiempo real
--
-- Añade la tabla public.echoes a la publicación de Supabase Realtime
-- para que los Ecos aparezcan en vivo (Árbol de Almas / Comunidad)
-- sin recargar. La lectura ya es pública (RLS de 0013), así que el
-- canal puede emitir a cualquier visitante.
--
-- CÓMO APLICAR:
--   Supabase → SQL Editor → New query → pega TODO → Run.  (Idempotente)
-- ===========================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'echoes'
  ) then
    alter publication supabase_realtime add table public.echoes;
  end if;
end $$;

-- Fin 0016.
