-- 0024 · Dashboard del Mundo: fotos en Huellas + monitor del Creador
-- Cambios ADITIVOS y seguros: no alteran datos ni el comportamiento existente.

-- Foto opcional en las Huellas (muro y Ritual). Columna nullable: las Huellas
-- previas quedan intactas (image_url = null).
alter table public.posts add column if not exists image_url text;

-- Monitor del Mundo — solo el Creador. Agregados de monitoreo en un solo JSON.
create or replace function public.world_monitor()
returns jsonb
language plpgsql
security definer
set search_path = 'public'
stable
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v jsonb;
begin
  if v_email <> 'sarkgraff@gmail.com' then
    raise exception 'Solo el Creador puede ver el monitor del Mundo.';
  end if;
  select jsonb_build_object(
    'souls',          (select count(*) from public.almas where coalesce(is_founding,false)=false),
    'awakened',       (select count(*) from public.almas where coalesce(awakening_completed,false)=true and coalesce(is_founding,false)=false),
    'origin',         (select count(*) from public.almas where coalesce(origin_soul,false)=true),
    'new_week',       (select count(*) from public.almas where coalesce(is_founding,false)=false and created_at >= now()-interval '7 days'),
    'with_photo',     (select count(*) from public.almas where coalesce(is_founding,false)=false and coalesce(avatar_url,'') <> ''),
    'with_country',   (select count(*) from public.almas where coalesce(is_founding,false)=false and coalesce(trim(country),'') <> ''),
    'by_level',       (select coalesce(jsonb_object_agg(lvl, n), '{}'::jsonb)
                         from (select coalesce(level,'EMBER') as lvl, count(*) n
                                 from public.almas where coalesce(is_founding,false)=false group by 1) t),
    'by_country',     public.souls_by_country(),
    'posts',          (select count(*) from public.posts),
    'posts_week',     (select count(*) from public.posts where created_at >= now()-interval '7 days'),
    'rituals',        (select count(*) from public.posts where kind='ritual'),
    'sparks',         (select count(*) from public.post_sparks),
    'follows',        (select count(*) from public.follows),
    'constellations', (select count(*)/2 from public.follows f
                         where exists (select 1 from public.follows g
                                        where g.follower_alma_id=f.following_alma_id
                                          and g.following_alma_id=f.follower_alma_id)),
    'comments',       (select count(*) from public.comments),
    'echoes',         (select count(*) from public.echoes),
    'echoes_today',   (select count(*) from public.echoes where created_at::date = now()::date),
    'works',          (select count(*) from public.portfolio),
    'active_today',   (select count(distinct user_id) from public.activity_log where created_at >= now()-interval '1 day'),
    'active_week',    (select count(distinct user_id) from public.activity_log where created_at >= now()-interval '7 days')
  ) into v;
  return v;
end;
$$;
revoke execute on function public.world_monitor() from public, anon;
grant  execute on function public.world_monitor() to authenticated;
