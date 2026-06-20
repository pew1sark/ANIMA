-- ===========================================================
-- ANIMA TSC — Migración 0012: Afinidad y Esencia
--
-- El RITO DE ENTRADA (umbral → despertar → crear alma → tutorial)
-- guarda dos cosas nuevas en cada Alma:
--   · almas.affinity → la naturaleza creadora elegida al nacer
--     (CREADOR | CONSTRUCTOR | VISIONARIO | EXPLORADOR | ESTRATEGA)
--   · almas.essence  → energía de crecimiento del camino ceremonial
--     (independiente de almas.xp, que pertenece al sistema del studio)
--
-- También:
--   · handle_new_user() ahora copia la afinidad desde los metadatos
--     del registro (raw_user_meta_data->>'affinity').
--   · add_essence(p_amount) suma Esencia de forma atómica y segura al
--     Alma del usuario autenticado (como give_spark, pero para uno mismo).
--
-- Seguridad: la Esencia solo la puede sumar el dueño del Alma; ningún
-- dato del Alma se expone ni se comparte. RLS de almas se respeta.
--
-- CÓMO APLICAR:
--   Supabase → SQL Editor → New query → pega TODO → Run.  (Idempotente)
-- ===========================================================

-- ---------- 1. Columnas nuevas ----------
alter table public.almas add column if not exists affinity text;
alter table public.almas add column if not exists essence  integer not null default 0;

-- ---------- 2. Alta de Alma: captura la Afinidad del rito ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.almas (user_id, name, role, level, xp, essence, affinity, bio)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
    'Creador',
    'EMBER',
    0,
    0,
    nullif(new.raw_user_meta_data->>'affinity',''),
    'Una nueva Alma en ANIMA. Aquí empieza tu trayectoria.'
  );
  return new;
end;
$function$;

-- ---------- 3. Sumar Esencia de forma atómica y segura ----------
-- Solo afecta al Alma del usuario autenticado. Devuelve la Esencia nueva.
create or replace function public.add_essence(p_amount integer)
returns integer
language sql
security definer
set search_path = ''
as $$
  update public.almas
     set essence = greatest(0, coalesce(essence, 0) + coalesce(p_amount, 0))
   where user_id = auth.uid()
  returning essence;
$$;

grant execute on function public.add_essence(integer) to authenticated;

-- Fin 0012.
