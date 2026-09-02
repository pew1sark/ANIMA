-- ===========================================================
-- 0082 · Nadie entra por la puerta de atrás
--
-- Dos accesos que existían sin que nadie los hubiera decidido.
-- Ninguno de los dos se veía leyendo las pantallas: había que
-- mirar los permisos de las funciones y el texto de la política.
--
-- ── 1. __wf_test() ────────────────────────────────────────
-- Una función de PRUEBAS del motor de flujos (0064) que quedó
-- viva en producción. Tenía EXECUTE para anon y authenticated,
-- search_path mutable —era el único aviso de search_path de
-- toda la base— y su cuerpo suplantaba a un usuario concreto
-- (set_config de request.jwt.claims + set local role) para
-- insertar y borrar filas en una empresa cliente.
--
-- El riesgo práctico era acotado, porque al ser SECURITY INVOKER
-- un llamador sin privilegios choca al leer auth.users. Pero una
-- función que suplanta a alguien no debe existir en producción
-- bajo ninguna circunstancia, y el sitio de una prueba es
-- supabase/tests/, no la base.
--
-- ── 2. companies_insert ───────────────────────────────────
-- La política solo exigía `created_by = auth.uid()`. Cualquier
-- usuario autenticado podía crear su propia empresa y, por el
-- disparador handle_new_company, quedar de owner: darse de alta
-- como cliente sin plan, sin suscripción y sin pasar por la
-- consola.
--
-- El alta de clientes ya tiene su vía, y es la correcta:
-- crear_cliente() exige is_platform_admin(), valida el slug,
-- comprueba el plan y la línea, y deja created_by en nulo a
-- propósito para que el disparador no haga miembro a quien da
-- de alta. Esta política era la puerta de al lado, abierta.
--
-- crear_cliente() sigue funcionando igual: es SECURITY DEFINER,
-- pertenece a postgres y companies NO tiene FORCE ROW LEVEL
-- SECURITY, así que su INSERT no pasa por esta política.
--
-- Las pruebas de supabase/tests/ tampoco se ven afectadas:
-- insertan sus empresas antes del `set local role authenticated`,
-- es decir como postgres.
-- ===========================================================

drop function if exists public.__wf_test();

drop policy if exists companies_insert on public.companies;

create policy companies_insert on public.companies
  for insert to authenticated
  with check (public.is_platform_admin());

comment on policy companies_insert on public.companies is
  'Una empresa solo la da de alta la plataforma. La vía es crear_cliente(); esta política cierra el INSERT directo.';
