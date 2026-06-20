-- ===========================================================
-- ANIMA TSC — Migración 0005: Consola del Creador
--
-- Permite que SOLO el Creador (sarkgraff@gmail.com) edite el
-- rol/nivel/XP/clan de cualquier Alma desde la Consola del Studio.
-- El resto de Almas siguen rigiéndose por sus políticas dueñas
-- (owns_alma) — esta migración solo AÑADE permisos para el Creador.
--
-- CÓMO APLICAR:
--   Supabase → SQL Editor → New query → pega TODO este archivo → Run.
-- Es idempotente (se puede correr más de una vez sin romper nada).
-- ===========================================================

-- ---------- 1. ¿La sesión actual es el Creador? ----------
-- Reconoce al Creador por el correo del JWT de Supabase Auth.
-- stable + sin acceso a tablas: barato de evaluar dentro de RLS.
create or replace function public.is_creator()
returns boolean
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'sarkgraff@gmail.com';
$$;

-- ---------- 2. El Creador puede LEER todas las Almas ----------
-- (La cara pública ya permite SELECT; esto garantiza acceso del
--  Creador aunque esa política cambie en el futuro.)
drop policy if exists "almas_creator_select" on public.almas;
create policy "almas_creator_select" on public.almas
  for select
  using (public.is_creator());

-- ---------- 3. El Creador puede ACTUALIZAR cualquier Alma ----------
-- Política permisiva: se suma (OR) a la política de dueño existente.
-- Sin esto, RLS bloquea editar a otras Almas desde la Consola.
drop policy if exists "almas_creator_update" on public.almas;
create policy "almas_creator_update" on public.almas
  for update
  using (public.is_creator())
  with check (public.is_creator());

-- Fin 0005.
