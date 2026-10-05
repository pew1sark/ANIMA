-- =====================================================================
-- 0001b · handle_new_user y owns_alma fuera del alcance de anon
--
-- RECUPERADA de supabase_migrations.schema_migrations (versión 20260619210050, «harden_security_definer_functions»).
-- Ya está aplicada en producción: se aplicó a mano y nunca tuvo archivo.
-- Se agrega para que el repo reconstruya la base desde cero
-- (supabase/tests/reconstruir). El SQL va tal como se aplicó.
-- =====================================================================

-- handle_new_user es solo trigger: nadie debe llamarlo por RPC
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- owns_alma lo usan las políticas RLS de usuarios autenticados:
-- se permite a authenticated, se bloquea a anon y al público general.
revoke all on function public.owns_alma(uuid) from public, anon;
grant execute on function public.owns_alma(uuid) to authenticated;
