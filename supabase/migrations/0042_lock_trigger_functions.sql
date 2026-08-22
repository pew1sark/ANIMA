-- ===========================================================
-- 0042 · Cierra el EXECUTE de las funciones de trigger del núcleo
-- Un trigger se ejecuta por cuenta de la tabla: nadie necesita
-- EXECUTE directo. Dejarlo abierto contradice el estándar de 0040.
-- ===========================================================
revoke execute on function public.handle_new_platform_user() from public, anon, authenticated;
revoke execute on function public.handle_new_company()       from public, anon, authenticated;
revoke execute on function public.touch_updated_at()         from public, anon, authenticated;
