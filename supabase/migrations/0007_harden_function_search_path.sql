-- ===========================================================
-- ANIMA TSC — Migración 0007: endurecer search_path de funciones
--
-- Fija search_path = '' en las funciones de seguridad (buena práctica:
-- evita que un search_path mutable cambie a qué objetos resuelven).
-- Todas referencian objetos con esquema explícito (public./auth.), así
-- que el search_path vacío no afecta su comportamiento.
--
-- CÓMO APLICAR: Supabase → SQL Editor → pega TODO → Run. (Idempotente)
-- Requiere 0005 (is_creator) y 0006 (in_my_clan / leads_clan).
-- ===========================================================

create or replace function public.is_creator()
returns boolean language sql stable set search_path = '' as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'sarkgraff@gmail.com';
$$;

create or replace function public.in_my_clan(p_clan text)
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.almas
    where user_id = auth.uid() and clan is not null and clan = p_clan
  );
$$;

create or replace function public.leads_clan(p_clan text)
returns boolean language sql stable set search_path = '' as $$
  select public.is_creator() or exists (
    select 1 from public.almas
    where user_id = auth.uid() and clan = p_clan and team_role in ('LIDER','ADMIN')
  );
$$;

-- Fin 0007.
