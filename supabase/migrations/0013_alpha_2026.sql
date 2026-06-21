-- ===========================================================
-- ANIMA TSC — Migración 0013: Arquitectura Alpha 2026
--
-- La fundación de datos de la Alpha oficial. Da cuerpo a cinco
-- columnas vertebrales del ecosistema:
--
--   1. CRONOLOGÍA DEL ALMA  · public.soul_timeline
--        ANIMA recuerda: cada hito del Alma queda escrito.
--   2. ECOS DE ANIMA        · public.echoes
--        El espacio vivo: "✦ Alicia despertó en España".
--   3. CONSEJO DE ALMAS     · almas.council + insignia "Alma Fundadora"
--        Las primeras 50 Almas ayudan a escribir la historia.
--   4. INSIGNIAS SECRETAS   · public.badges + public.soul_badges
--        No se anuncian: se descubren.
--   5. SISTEMA DE LOGS      · public.activity_log
--        Cada acción importante deja registro (privado del Alma).
--
-- Y además:
--   · Contadores públicos: souls_count() / souls_by_country()
--     para "34 / 100 Almas" y el Árbol de Almas.
--   · Límites de almacenamiento por nivel: storage_quota(level).
--   · Buckets separados: avatars · portfolio · temp.
--   · founder_stats(): el Panel del Fundador (solo el Creador).
--
-- LÍMITE ALPHA GLOBAL: 100 ALMAS. La exclusividad es parte del diseño.
--
-- Seguridad: todo lo privado vive tras RLS por user_id/owns_alma.
-- Lo público (ecos, contadores) es de solo lectura. Las escrituras
-- pasan por funciones security definer acotadas al Alma del que llama.
--
-- CÓMO APLICAR:
--   Supabase → SQL Editor → New query → pega TODO → Run.  (Idempotente)
-- ===========================================================

-- Correo del Creador (Panel del Fundador). Si cambia, ajustar aquí.
-- (No se puede usar un parámetro; va incrustado en founder_stats()).

-- ===========================================================
-- 1. CRONOLOGÍA DEL ALMA — public.soul_timeline
-- "Porque ANIMA recordará."
-- ===========================================================
create table if not exists public.soul_timeline (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  event_type  text not null,                 -- despertar | obra | nivel | eco | insignia | …
  title       text not null,                 -- "Tu Alma despertó."
  description text,                           -- detalle opcional
  created_at  timestamptz not null default now()
);
create index if not exists soul_timeline_user_idx on public.soul_timeline(user_id, created_at desc);
alter table public.soul_timeline enable row level security;

-- Cada Alma lee y escribe SOLO su propia cronología.
drop policy if exists "timeline_own_select" on public.soul_timeline;
create policy "timeline_own_select" on public.soul_timeline
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "timeline_own_insert" on public.soul_timeline;
create policy "timeline_own_insert" on public.soul_timeline
  for insert to authenticated with check (user_id = auth.uid());

-- Escritura segura desde el cliente (no necesita conocer su user_id).
create or replace function public.log_timeline(p_event text, p_title text, p_desc text default null)
returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into public.soul_timeline (user_id, event_type, title, description)
  values (auth.uid(), p_event, p_title, p_desc)
  returning id;
$$;
grant execute on function public.log_timeline(text, text, text) to authenticated;


-- ===========================================================
-- 2. ECOS DE ANIMA — public.echoes
-- No es una red social: es un espacio vivo. Lectura pública,
-- movimiento suave, sin scroll infinito agresivo (límite en cliente).
-- ===========================================================
create table if not exists public.echoes (
  id          uuid primary key default gen_random_uuid(),
  alma_id     uuid references public.almas(id) on delete set null,
  alma_name   text not null,                 -- "Alicia"
  country     text,                           -- "España"
  kind        text not null,                 -- despertar | huella | nivel | senal | eco
  text        text not null,                 -- "✦ Alicia despertó en España"
  created_at  timestamptz not null default now()
);
create index if not exists echoes_created_idx on public.echoes(created_at desc);
alter table public.echoes enable row level security;

-- Cualquiera ve los Ecos (es la presencia viva de la comunidad).
drop policy if exists "echoes_public_read" on public.echoes;
create policy "echoes_public_read" on public.echoes for select using (true);

-- Emitir un Eco: solo por el dueño de un Alma, con su nombre/país reales.
create or replace function public.emit_echo(p_kind text, p_text text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id   uuid;
  v_name text;
  v_ctry text;
begin
  select id, name, country into v_id, v_name, v_ctry
    from public.almas where user_id = auth.uid();
  if v_id is null then
    raise exception 'No hay un Alma para esta sesión.';
  end if;
  insert into public.echoes (alma_id, alma_name, country, kind, text)
  values (v_id, split_part(coalesce(v_name,'Alma'),' ',1), v_ctry, p_kind, p_text)
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function public.emit_echo(text, text) to authenticated;


-- ===========================================================
-- 3 + 4. INSIGNIAS + CONSEJO DE ALMAS
-- Insignias secretas: no se anuncian, se descubren.
-- Consejo: las primeras 50 Almas reales (Alma Fundadora).
-- ===========================================================

-- Catálogo de insignias (qué existe y si es secreta).
create table if not exists public.badges (
  code        text primary key,
  name        text not null,
  description text,
  glyph       text default '✦',
  secret      boolean not null default true
);
alter table public.badges enable row level security;
drop policy if exists "badges_public_read" on public.badges;
create policy "badges_public_read" on public.badges for select using (true);

insert into public.badges (code, name, description, glyph, secret) values
  ('primer_latido', 'Primer Latido', 'Tu primera obra en ANIMA.',           '❤', true),
  ('alma_fundadora','Alma Fundadora','Una de las primeras 50 Almas.',        '✦', false),
  ('explorador',    'Explorador',    'Completaste el Despertar.',            '✧', true),
  ('eco_vivo',      'Eco Vivo',      'Recibiste interacción de otra Alma.',  '◎', true),
  ('guardian',      'Guardián',      'Ayudaste a otra Alma.',                '✺', true),
  ('persistencia',  'Persistencia',  '30 días habitando ANIMA.',             '∞', true)
on conflict (code) do update
  set name = excluded.name, description = excluded.description,
      glyph = excluded.glyph, secret = excluded.secret;

-- Insignias descubiertas por cada Alma.
create table if not exists public.soul_badges (
  user_id    uuid not null references auth.users(id) on delete cascade,
  code       text not null references public.badges(code) on delete cascade,
  earned_at  timestamptz not null default now(),
  primary key (user_id, code)
);
alter table public.soul_badges enable row level security;
-- Cada Alma ve sus propias insignias.
drop policy if exists "soul_badges_own_select" on public.soul_badges;
create policy "soul_badges_own_select" on public.soul_badges
  for select to authenticated using (user_id = auth.uid());

-- Otorgar una insignia (idempotente). Deja eco + cronología la 1ª vez.
create or replace function public.award_badge(p_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new  boolean := false;
  v_name text;
begin
  insert into public.soul_badges (user_id, code)
  values (auth.uid(), p_code)
  on conflict (user_id, code) do nothing;
  get diagnostics v_new = row_count;
  if v_new then
    select name into v_name from public.badges where code = p_code;
    insert into public.soul_timeline (user_id, event_type, title, description)
    values (auth.uid(), 'insignia', 'Descubriste una insignia', coalesce(v_name, p_code));
  end if;
  return v_new;
end;
$$;
grant execute on function public.award_badge(text) to authenticated;

-- Consejo de Almas: las primeras 50 Almas reales.
alter table public.almas add column if not exists council boolean not null default false;

-- Backfill (una vez): las primeras 50 Almas reales por orden de llegada
-- entran al Consejo y reciben la insignia Alma Fundadora.
with first_fifty as (
  select id, user_id from public.almas
  where coalesce(is_founding,false) = false
  order by created_at asc
  limit 50
)
update public.almas a set council = true
  from first_fifty f where a.id = f.id and a.council = false;

insert into public.soul_badges (user_id, code)
  select user_id, 'alma_fundadora' from public.almas
  where council = true and user_id is not null
on conflict do nothing;


-- ===========================================================
-- 5. SISTEMA DE LOGS — public.activity_log
-- Registro privado de cada acción importante del Alma.
-- ===========================================================
create table if not exists public.activity_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade,
  action     text not null,                  -- login | logout | obra_subida | nivel | …
  meta       jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists activity_log_user_idx on public.activity_log(user_id, created_at desc);
alter table public.activity_log enable row level security;
drop policy if exists "activity_own_select" on public.activity_log;
create policy "activity_own_select" on public.activity_log
  for select to authenticated using (user_id = auth.uid());

create or replace function public.log_activity(p_action text, p_meta jsonb default '{}'::jsonb)
returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into public.activity_log (user_id, action, meta)
  values (auth.uid(), p_action, coalesce(p_meta, '{}'::jsonb))
  returning id;
$$;
grant execute on function public.log_activity(text, jsonb) to authenticated;


-- ===========================================================
-- 6. CONTADORES PÚBLICOS — "34 / 100 Almas" y el Árbol de Almas
-- Solo cuentan Almas reales (is_founding = false). Anon puede leer.
-- ===========================================================
create or replace function public.souls_count()
returns integer
language sql
security definer
stable
set search_path = ''
as $$
  select count(*)::int from public.almas where coalesce(is_founding, false) = false;
$$;
grant execute on function public.souls_count() to anon, authenticated;

-- Almas por país, para el mapa: [{"country":"Chile","n":12}, …]
create or replace function public.souls_by_country()
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('country', country, 'n', n) order by n desc), '[]'::jsonb)
  from (
    select coalesce(nullif(trim(country), ''), 'En tránsito') as country, count(*)::int as n
    from public.almas
    where coalesce(is_founding, false) = false
    group by 1
  ) t;
$$;
grant execute on function public.souls_by_country() to anon, authenticated;


-- ===========================================================
-- 7. ALMACENAMIENTO POR NIVEL — storage_quota(level)
-- Devuelve {images, pdfs, mb} para el nivel dado. El cliente
-- usa esto para no dejar subir más allá del umbral del Alma.
-- ===========================================================
create or replace function public.storage_quota(p_level text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case upper(coalesce(p_level, 'FOUNDING'))
    when 'EMBER'  then jsonb_build_object('images', 5,  'pdfs', 1, 'mb', 50)   -- CHISPA
    when 'ROOT'   then jsonb_build_object('images', 7,  'pdfs', 2, 'mb', 80)   -- RAÍZ
    when 'WILD'   then jsonb_build_object('images', 7,  'pdfs', 2, 'mb', 80)   -- PULSO
    when 'TOTEM'  then jsonb_build_object('images', 8,  'pdfs', 2, 'mb', 90)   -- HUELLA
    when 'AETHER' then jsonb_build_object('images', 9,  'pdfs', 2, 'mb', 95)   -- TÓTEM
    when 'SPIRIT' then jsonb_build_object('images', 10, 'pdfs', 2, 'mb', 100)  -- AURA
    when 'ANIMA'  then jsonb_build_object('images', 10, 'pdfs', 2, 'mb', 100)  -- ANIMA
    else               jsonb_build_object('images', 3,  'pdfs', 1, 'mb', 30)   -- ORIGEN/FOUNDING
  end;
$$;
grant execute on function public.storage_quota(text) to anon, authenticated;


-- ===========================================================
-- 8. BUCKETS SEPARADOS — avatars · portfolio · temp
-- avatars  : fotos de perfil (≤ 2 MB, png/jpg/webp), lectura pública.
-- portfolio: obras (≤ 10 MB, png/jpg/webp/pdf),       lectura pública.
-- temp     : archivos temporales del Alma (privados).
-- El bucket "media" (0008) se mantiene por compatibilidad.
-- ===========================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152,
        array['image/png','image/jpeg','image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portfolio', 'portfolio', true, 10485760,
        array['image/png','image/jpeg','image/webp','application/pdf'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit)
values ('temp', 'temp', false, 31457280)
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit;

-- Políticas: lectura pública para avatars/portfolio; cada Alma escribe
-- solo en SU carpeta /<uid>/… (igual patrón que el bucket "media").
do $$
declare b text;
begin
  foreach b in array array['avatars','portfolio'] loop
    execute format('drop policy if exists "%1$s_public_read" on storage.objects;', b);
    execute format($p$create policy "%1$s_public_read" on storage.objects
      for select using (bucket_id = %1$L);$p$, b);
  end loop;

  foreach b in array array['avatars','portfolio','temp'] loop
    execute format('drop policy if exists "%1$s_auth_insert" on storage.objects;', b);
    execute format($p$create policy "%1$s_auth_insert" on storage.objects
      for insert to authenticated
      with check (bucket_id = %1$L and (storage.foldername(name))[1] = auth.uid()::text);$p$, b);

    execute format('drop policy if exists "%1$s_auth_update" on storage.objects;', b);
    execute format($p$create policy "%1$s_auth_update" on storage.objects
      for update to authenticated
      using (bucket_id = %1$L and (storage.foldername(name))[1] = auth.uid()::text)
      with check (bucket_id = %1$L and (storage.foldername(name))[1] = auth.uid()::text);$p$, b);

    execute format('drop policy if exists "%1$s_auth_delete" on storage.objects;', b);
    execute format($p$create policy "%1$s_auth_delete" on storage.objects
      for delete to authenticated
      using (bucket_id = %1$L and (storage.foldername(name))[1] = auth.uid()::text);$p$, b);
  end loop;
end $$;

-- temp es privado: solo el dueño puede leer sus temporales.
drop policy if exists "temp_owner_read" on storage.objects;
create policy "temp_owner_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'temp' and (storage.foldername(name))[1] = auth.uid()::text);


-- ===========================================================
-- 9. ALTA DE ALMA — el rito de nacimiento, ampliado
-- Al nacer un Alma:
--   · Se le asigna Consejo si es de las primeras 50.
--   · Se escribe "Tu Alma despertó." en su Cronología.
--   · Se descubre la insignia Alma Fundadora (Consejo) y Explorador.
--   · Se emite un Eco: "✦ <Nombre> despertó en <País>".
-- (create or replace: extiende handle_new_user de 0012 sin romperlo.)
-- ===========================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_name    text := coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1));
  v_country text := nullif(new.raw_user_meta_data->>'country','');
  v_rank    integer;
  v_council boolean := false;
  v_alma    uuid;
begin
  -- Rango entre las Almas reales (las primeras 50 forman el Consejo).
  select count(*) into v_rank from public.almas where coalesce(is_founding,false) = false;
  v_council := (v_rank < 50);

  insert into public.almas (user_id, name, role, level, xp, essence, affinity, country, council, bio)
  values (
    new.id, v_name, 'Creador', 'EMBER', 0, 0,
    nullif(new.raw_user_meta_data->>'affinity',''),
    v_country, v_council,
    'Una nueva Alma en ANIMA. Aquí empieza tu trayectoria.'
  )
  returning id into v_alma;

  -- Cronología: el primer recuerdo.
  insert into public.soul_timeline (user_id, event_type, title, description)
  values (new.id, 'despertar', 'Tu Alma despertó.', 'Bienvenida a ANIMA.');

  -- Insignias de nacimiento.
  insert into public.soul_badges (user_id, code) values (new.id, 'explorador')
    on conflict do nothing;
  if v_council then
    insert into public.soul_badges (user_id, code) values (new.id, 'alma_fundadora')
      on conflict do nothing;
  end if;

  -- Eco vivo para toda la comunidad.
  insert into public.echoes (alma_id, alma_name, country, kind, text)
  values (v_alma, split_part(v_name,' ',1), v_country, 'despertar',
          '✦ ' || split_part(v_name,' ',1) || ' despertó' ||
          coalesce(' en ' || v_country, ''));

  return new;
end;
$function$;


-- ===========================================================
-- 10. PANEL DEL FUNDADOR — founder_stats()
-- Solo el Creador (por correo en el JWT) puede leer los agregados.
-- Cualquier otra sesión recibe un error.
-- ===========================================================
create or replace function public.founder_stats()
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_out   jsonb;
begin
  if v_email <> 'sarkgraff@gmail.com' then
    raise exception 'Solo el Fundador puede ver este panel.';
  end if;

  select jsonb_build_object(
    'souls',         (select count(*) from public.almas where coalesce(is_founding,false)=false),
    'limit',         100,
    'countries',     public.souls_by_country(),
    'active_today',  (select count(distinct user_id) from public.activity_log
                        where created_at >= (now() - interval '1 day')),
    'active_week',   (select count(distinct user_id) from public.activity_log
                        where created_at >= (now() - interval '7 day')),
    'works',         (select count(*) from public.portfolio),
    'feedback_avg',  (select round(avg(rating)::numeric, 1) from public.feedback where rating is not null),
    'feedback_n',    (select count(*) from public.feedback),
    'council',       (select count(*) from public.almas where council = true),
    'echoes',        (select count(*) from public.echoes)
  ) into v_out;

  return v_out;
end;
$$;
grant execute on function public.founder_stats() to authenticated;

-- Fin 0013.
