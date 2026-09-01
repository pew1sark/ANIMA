-- 0078b — Devuelve los acentos a los textos que ve el Alma
--
-- Al aplicar la 0078 escribí la función sin acentos por precaución con la
-- codificación. Eso no era una precaución: era una regresión. "Tu Alma
-- desperto." y "Aqui empieza tu trayectoria." son textos que la persona lee.
-- Esta migración deja la función exactamente como está en el archivo 0078.

begin;
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_name text := coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1));
  v_country text := nullif(new.raw_user_meta_data->>'country','');
  v_rank integer; v_council boolean := false; v_alma uuid;
begin
  -- La cuenta nace para trabajar en una empresa: ni Alma, ni insignias, ni
  -- un eco en el Árbol contando que despertó alguien que nunca cruzó nada.
  if new.raw_user_meta_data->>'origen' = 'company' then
    return new;
  end if;

  select count(*) into v_rank from public.almas where coalesce(is_founding,false) = false;
  v_council := (v_rank < 50);
  insert into public.almas (user_id, name, role, level, xp, essence, affinity, country, council, bio)
  values (new.id, v_name, 'Creador', 'EMBER', 0, 0,
    nullif(new.raw_user_meta_data->>'affinity',''), v_country, v_council,
    'Una nueva Alma en ANIMA. Aquí empieza tu trayectoria.')
  returning id into v_alma;
  insert into public.soul_timeline (user_id, event_type, title, description)
  values (new.id, 'despertar', 'Tu Alma despertó.', 'Bienvenida a ANIMA.');
  insert into public.soul_badges (user_id, code) values (new.id, 'explorador') on conflict do nothing;
  if v_council then
    insert into public.soul_badges (user_id, code) values (new.id, 'alma_fundadora') on conflict do nothing;
  end if;
  insert into public.echoes (alma_id, alma_name, country, kind, text)
  values (v_alma, split_part(v_name,' ',1), v_country, 'despertar',
          '✦ ' || split_part(v_name,' ',1) || ' despertó' || coalesce(' en ' || v_country, ''));
  return new;
end;
$function$;

comment on function public.handle_new_user() is
  'Despierta un Alma con cada cuenta nueva, salvo que raw_user_meta_data.origen sea ''company''.';

commit;
