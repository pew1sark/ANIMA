-- ===========================================================
-- 0128 · El panel inmobiliario dice DÓNDE
-- -----------------------------------------------------------
-- `rei_resumen()` contestaba cuánto hay, cuánto se vendió y qué
-- falta, pero no dónde. Para una firma que capta en un municipio y
-- desarrolla en otro, eso no es un adorno: la brecha entre oferta y
-- demanda de Pamplona no se atiende con inventario de Cúcuta.
--
-- Se agrega la clave `mapa` con una fila por municipio. NO se toca
-- nada de lo que ya devolvía: cifras, series, listas y alertas salen
-- igual, así que la pantalla vieja sigue funcionando mientras la
-- nueva aprende a leer la clave.
--
-- El municipio va como TEXTO, tal como lo escribió quien cargó la
-- ficha, junto al departamento. Traducirlo aquí al código DIVIPOLA
-- habría metido en la base un catálogo de 1.122 municipios y una
-- decisión —«Berlín» no es municipio, es corregimiento de Tona— que
-- se toma mejor donde está el mapa, y que ahí se puede dejar a la
-- vista en vez de perderla en un `null`.
--
-- Por qué las tres cifras y no una: un municipio con veinte
-- inmuebles de los que ninguno está disponible no es un mercado, es
-- un histórico; y uno con treinta compradores y dos inmuebles es
-- exactamente donde hay que salir a captar. Con un solo número las
-- dos situaciones se dibujan igual.
-- ===========================================================

create or replace function public.rei_mapa(p_company uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  with inm as (
    select coalesce(nullif(btrim(city), ''), 'Sin municipio') as municipio,
           count(*) as inmuebles,
           count(*) filter (where commercial_status = 'disponible') as disponibles,
           count(*) filter (where commercial_status = 'vendido')    as vendidos
      from public.rei_properties
     where company_id = p_company and deleted_at is null
     group by 1
  ), dem as (
    select coalesce(nullif(btrim(city), ''), 'Sin municipio') as municipio,
           count(*) as compradores,
           count(*) filter (where client_status = 'activo') as compradores_activos
      from public.rei_buyers
     where company_id = p_company and deleted_at is null
     group by 1
  ), todo as (
    select coalesce(i.municipio, d.municipio) as municipio,
           coalesce(i.inmuebles, 0)   as inmuebles,
           coalesce(i.disponibles, 0) as disponibles,
           coalesce(i.vendidos, 0)    as vendidos,
           coalesce(d.compradores, 0) as compradores,
           coalesce(d.compradores_activos, 0) as compradores_activos
      from inm i full outer join dem d on d.municipio = i.municipio
  )
  select case when public.has_company_level(p_company, 40)
    then jsonb_build_object(
      -- El departamento de la empresa: desata los homónimos —hay cuatro
      -- «La Unión»— cuando la ficha del inmueble no lo trae.
      'departamento', (select value->>'region' from public.company_config
                        where company_id = p_company and key = 'ficha'),
      'municipios', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'municipio',    t.municipio,
                 'inmuebles',    t.inmuebles,
                 'disponibles',  t.disponibles,
                 'vendidos',     t.vendidos,
                 'compradores',  t.compradores,
                 'compradores_activos', t.compradores_activos)
               order by t.inmuebles + t.compradores desc, t.municipio)
          from todo t), '[]'::jsonb),
      'total_inmuebles',   (select coalesce(sum(inmuebles), 0) from todo),
      'total_compradores', (select coalesce(sum(compradores), 0) from todo))
    else '{}'::jsonb end;
$$;
comment on function public.rei_mapa(uuid) is
  'Inventario y demanda por municipio, con el municipio tal como está escrito en la ficha. Lo ubica el mapa, no la base.';
revoke execute on function public.rei_mapa(uuid) from public, anon;
grant  execute on function public.rei_mapa(uuid) to authenticated;
