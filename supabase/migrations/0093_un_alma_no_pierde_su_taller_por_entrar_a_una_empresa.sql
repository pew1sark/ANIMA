begin;

-- ---------------------------------------------------------------------------
-- Tener un Alma y trabajar en una empresa dejan de ser excluyentes
-- ---------------------------------------------------------------------------
-- La migración 0078 hizo bien en separar al trabajador de empresa del Alma:
-- dar de alta a alguien en una empresa no debería hacerlo despertar en ANIMA.
-- Pero lo resolvió con dos candados, y el segundo cerraba de más.
--
--   1. `handle_new_user` no crea Alma si la cuenta nace con origen 'company'.
--      Ese está bien: corta el problema en el origen.
--
--   2. `mis_lineas` le quitaba la puerta de STUDIO a cualquiera que tuviera un
--      Alma Y perteneciera a una empresa. Era una red de seguridad retroactiva,
--      para las cuentas creadas antes de que existiera la marca de origen.
--
-- El segundo candado tiene un daño que ya se ve venir: un artista con su Alma
-- —su Taller, sus proyectos, su portafolio— que además entra a trabajar a una
-- empresa PIERDE su Taller. No lo pierde de verdad: sigue todo ahí, pero deja
-- de tener por dónde llegar. Y no hay forma de recuperarlo salvo salirse de la
-- empresa.
--
-- Ser Alma y trabajar en una empresa no es una contradicción; es lo normal en
-- cualquiera que cree por su cuenta y además tenga un empleo.

create or replace function public.mis_lineas()
returns text[]
language sql stable security definer set search_path to 'public','pg_temp'
as $fn$
  select coalesce(array_agg(distinct linea), '{}'::text[])
    from (
      -- Las líneas de las empresas donde trabaja, con plan vigente.
      select pl.slug as linea
        from public.company_members m
        join public.companies    c  on c.id  = m.company_id
        join public.subscriptions s  on s.company_id = c.id
        join public.plans        p  on p.id  = s.plan_id
        join public.product_lines pl on pl.id = p.product_line_id
       where m.user_id = (select auth.uid())
         and m.status  = 'active'
         and s.status in ('prueba', 'activa', 'morosa')
         and pl.active
      union
      -- Y STUDIO si tiene un Alma. Sin condiciones: el Alma es suya, no de la
      -- empresa donde trabaje hoy. Que un trabajador de empresa no tenga Alma
      -- lo garantiza `handle_new_user`, que es donde corresponde garantizarlo.
      select 'studio'
        from public.almas a
       where a.user_id = (select auth.uid())
    ) t;
$fn$;

comment on function public.mis_lineas() is
  'Sub-plataformas a las que puede entrar el usuario actual: las de los planes de sus empresas, más STUDIO si tiene un Alma.';

-- ---------------------------------------------------------------------------
-- Y el primer candado se refuerza, porque dependía de que alguien se acordara
-- ---------------------------------------------------------------------------
-- La marca `origen: 'company'` la tiene que poner quien crea la cuenta. Si se
-- crea a mano desde el panel de Supabase —que es como se están creando hoy— y
-- a alguien se le olvida, el trabajador despierta como Alma: sale su nombre en
-- el Árbol, se le da una insignia y aparece un eco anunciando algo que nunca
-- pasó.
--
-- La invitación pendiente ya dice todo eso sin que nadie tenga que acordarse:
-- si hay una invitación a una empresa esperando por ese correo, la cuenta que
-- se está creando es la de esa persona para trabajar ahí.

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_name text := coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1));
  v_country text := nullif(new.raw_user_meta_data->>'country','');
  v_rank integer; v_council boolean := false; v_alma uuid;
begin
  -- La cuenta nace para trabajar en una empresa: ni Alma, ni insignias, ni un
  -- eco en el Árbol contando que despertó alguien que nunca cruzó nada.
  if new.raw_user_meta_data->>'origen' = 'company' then
    return new;
  end if;

  -- Lo mismo si la están esperando con una invitación a una empresa. Esto no
  -- depende de que quien crea la cuenta se acuerde de marcarla.
  if exists (
    select 1 from public.user_invitations i
     where lower(i.email) = lower(new.email)
       and i.used_at is null
       and i.expires_at > now()
  ) then
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
  'Despierta un Alma con la cuenta nueva, salvo que nazca para trabajar en una empresa: marcada con origen=company o esperada por una invitación vigente.';

commit;
