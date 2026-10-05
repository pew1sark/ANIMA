-- =====================================================================
-- 0032c · Tipo de documento y diseño en cotizaciones
--
-- RECUPERADA de supabase_migrations.schema_migrations (versión 20260624085931, «quotes_doctype_design»).
-- Ya está aplicada en producción: se aplicó a mano y nunca tuvo archivo.
-- Se agrega para que el repo reconstruya la base desde cero
-- (supabase/tests/reconstruir). El SQL va tal como se aplicó.
-- =====================================================================

alter table public.quotes add column if not exists doc_type text;
alter table public.quotes add column if not exists design jsonb;
