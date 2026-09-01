-- 0078 — Un trabajador de una empresa no es un Alma
--
-- `handle_new_user` crea un Alma para TODA cuenta nueva de Auth, y además
-- publica un eco "✦ … despertó" en el mundo. Eso está bien cuando alguien
-- cruza el Umbral; está mal cuando lo que pasó es que a un trabajador de un
-- cliente le dieron acceso a su pega.
--
-- Se vio probando: una cuenta creada para una empresa de COMPANY aparecía con
-- Alma, con la puerta de STUDIO abierta y con un eco público en el Árbol.
--
-- Dos arreglos, uno para lo que ya existe y otro para lo que venga:
--   1. `mis_lineas` deja de abrir STUDIO por el solo hecho de tener un Alma.
--   2. `handle_new_user` acepta que le digan que la cuenta nace para una
--      empresa, y entonces no crea Alma ni eco.

begin;

-- ---------------------------------------------------------------------------
-- 1. Un Alma abre STUDIO solo si esa persona no vino a trabajar a una empresa
-- ---------------------------------------------------------------------------

create or replace function public.mis_lineas()
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select coalesce(array_agg(distinct linea), '{}'::text[])
    from (
      -- Lo que habilita el plan de cada organización donde eres miembro.
      -- `morosa` sigue abriendo: cortarle el acceso a quien debe es una
      -- decisión comercial, no algo que deba pasar solo.
      select pl.slug as linea
        from public.company_members m
        join public.companies    c  on c.id  = m.company_id
        join public.subscriptions s on s.company_id = c.id
        join public.plans        p  on p.id  = s.plan_id
        join public.product_lines pl on pl.id = p.product_line_id
       where m.user_id = (select auth.uid())
         and m.status  = 'active'
         and s.status in ('prueba', 'activa', 'morosa')
         and pl.active

      union

      -- El Alma es la entrada gratuita a STUDIO: las 22 de la Alpha no tienen
      -- organización ni plan, y aun así ahí es donde viven.
      --
      -- Pero el trigger de Auth le crea un Alma a cualquiera, incluida la
      -- cuenta de un cajero al que dieron de alta en una pescadería. Si esa
      -- persona pertenece a una organización de COMPANY, su lugar es esa
      -- empresa y no el mundo de las Almas.
      select 'studio'
        from public.almas a
       where a.user_id = (select auth.uid())
         and not exists (
           select 1
             from public.company_members m
             join public.companies    c  on c.id = m.company_id
             join public.product_lines pl on pl.id = c.product_line_id
            where m.user_id = (select auth.uid())
              and m.status  = 'active'
              and pl.slug   = 'company'
         )
    ) t;
$fn$;

comment on function public.mis_lineas() is
  'Sub-plataformas a las que puede entrar el usuario actual: las de sus planes, más STUDIO si su Alma no nació para trabajar en una empresa.';

-- ---------------------------------------------------------------------------
-- 2. Dar de alta a alguien en una empresa no lo hace despertar en ANIMA
-- ---------------------------------------------------------------------------
-- Quien cree la cuenta puede decirlo: raw_user_meta_data.origen = 'company'.
-- Sin esa marca todo sigue exactamente como antes, así que el Umbral no se
-- entera de este cambio.

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
