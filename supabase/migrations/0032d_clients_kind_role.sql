-- =====================================================================
-- 0032d · Tipo y rol en vínculos
--
-- RECUPERADA de supabase_migrations.schema_migrations (versión 20260624091447, «clients_kind_role»).
-- Ya está aplicada en producción: se aplicó a mano y nunca tuvo archivo.
-- Se agrega para que el repo reconstruya la base desde cero
-- (supabase/tests/reconstruir). El SQL va tal como se aplicó.
-- =====================================================================

alter table public.clients add column if not exists kind text not null default 'cliente';
alter table public.clients add column if not exists role text;
