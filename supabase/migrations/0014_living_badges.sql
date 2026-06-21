-- ===========================================================
-- ANIMA TSC — Migración 0014: Insignias vivas + Ecos de interacción
--
-- Completa el sistema Alpha 2026 para que TODAS las insignias se
-- puedan descubrir y los Ecos reflejen la vida de la comunidad:
--
--   · give_spark() ahora, al recibir una Chispa, otorga la insignia
--     "Eco Vivo" al Alma que la recibe (la primera vez), deja su
--     recuerdo en la Cronología y emite un Eco "recibió una señal".
--   · claim_time_badges() otorga "Persistencia" a quien lleva 30 días
--     habitando ANIMA.
--
--   ("Guardián" se otorga desde el cliente al ayudar/comentar a otra
--    Alma, vía award_badge.)
--
-- CÓMO APLICAR:
--   Supabase → SQL Editor → New query → pega TODO → Run.  (Idempotente)
-- ===========================================================

-- ---------- 1. Chispa → Eco Vivo para quien la recibe ----------
create or replace function public.give_spark(p_alma uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sparks integer;
  v_uid    uuid;
  v_name   text;
  v_ctry   text;
  v_new    boolean := false;
begin
  update public.almas
     set sparks = coalesce(sparks, 0) + 1
   where id = p_alma
  returning sparks, user_id, name, country into v_sparks, v_uid, v_name, v_ctry;

  if v_uid is not null then
    insert into public.soul_badges (user_id, code) values (v_uid, 'eco_vivo')
      on conflict do nothing;
    get diagnostics v_new = row_count;
    if v_new then
      insert into public.soul_timeline (user_id, event_type, title, description)
      values (v_uid, 'eco', 'Recibiste tu primer Eco', 'Otra Alma apreció tu trabajo.');
      insert into public.echoes (alma_id, alma_name, country, kind, text)
      values (p_alma, split_part(coalesce(v_name,'Alma'),' ',1), v_ctry, 'eco',
              '✦ ' || split_part(coalesce(v_name,'Alma'),' ',1) || ' recibió una señal');
    end if;
  end if;

  return v_sparks;
end;
$$;
grant execute on function public.give_spark(uuid) to anon, authenticated;

-- ---------- 2. Persistencia: 30 días habitando ANIMA ----------
create or replace function public.claim_time_badges()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created timestamptz;
  v_new     boolean := false;
begin
  select created_at into v_created from public.almas where user_id = auth.uid();
  if v_created is not null and v_created <= (now() - interval '30 days') then
    insert into public.soul_badges (user_id, code) values (auth.uid(), 'persistencia')
      on conflict do nothing;
    get diagnostics v_new = row_count;
    if v_new then
      insert into public.soul_timeline (user_id, event_type, title, description)
      values (auth.uid(), 'insignia', '30 días habitando ANIMA', 'La constancia también crea.');
    end if;
  end if;
  return v_new;
end;
$$;
revoke execute on function public.claim_time_badges() from public, anon;
grant  execute on function public.claim_time_badges() to authenticated;

-- Fin 0014.
