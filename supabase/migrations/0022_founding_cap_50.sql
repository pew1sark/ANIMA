-- 0022 · Alpha: ampliar las Almas del Origen (Fundadoras) de 30 a 50.
-- El Mundo admite hasta 100 Almas en esta Alpha; las primeras 50 quedan
-- registradas como Almas del Origen (hitos del Mundo). Solo cambia el umbral
-- del número de Origen; el resto de la ceremonia permanece idéntico.

create or replace function public.complete_awakening()
returns public.almas
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_alma  public.almas;
  v_count integer;
  v_num   integer;
  v_is_origin boolean;
begin
  select * into v_alma from public.almas where user_id = auth.uid();
  if not found then
    raise exception 'No hay un Alma para esta sesión.';
  end if;

  -- Ya cruzó el Umbral: no se repite ni se reasigna (ni IDs ni número).
  if coalesce(v_alma.awakening_completed, false) then
    return v_alma;
  end if;

  -- Número del Origen, atómico por orden de despertar (solo Almas reales).
  perform pg_advisory_xact_lock(hashtext('anima_origin_number'));
  select count(*) into v_count
    from public.almas
   where coalesce(awakening_completed,false) = true
     and coalesce(is_founding,false) = false;
  v_num := v_count + 1;
  v_is_origin := (v_num <= 50);   -- Alpha: 50 Almas Fundadoras

  update public.almas
     set awakening_completed = true,
         awakening_date      = now(),
         origin_soul         = v_is_origin,
         origin_number       = v_num,
         era                 = case when v_is_origin then 'ORIGEN' else coalesce(era, 'ANIMA') end,
         essence             = greatest(coalesce(essence, 0), 1)
   where user_id = auth.uid()
   returning * into v_alma;

  -- Cronología del Primer Despertar (no rompe el despertar si falla).
  begin
    insert into public.soul_timeline (user_id, event_type, title, description)
    values (auth.uid(), 'origen', 'Primer Despertar',
      'Lumbre te recibió. Tu Esencia despertó. El Árbol reconoció tu presencia.' ||
      case when v_is_origin then ' Formaste parte de la Era del Origen.' else '' end);
  exception when others then null;
  end;

  return v_alma;
end;
$$;

grant execute on function public.complete_awakening() to authenticated;
