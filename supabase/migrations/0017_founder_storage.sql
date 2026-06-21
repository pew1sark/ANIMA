-- ===========================================================
-- ANIMA TSC — Migración 0017: Espacio de Storage real en el Panel
--
-- Amplía founder_stats() para sumar el espacio realmente usado en
-- los buckets (media · avatars · portfolio · temp), por bucket y total,
-- contra el LÍMITE ALPHA de ~10 GB. Solo el Creador puede leerlo.
--
-- CÓMO APLICAR:
--   Supabase → SQL Editor → New query → pega TODO → Run.  (Idempotente)
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
    'souls',        (select count(*) from public.almas where coalesce(is_founding,false)=false),
    'limit',        100,
    'countries',    public.souls_by_country(),
    'active_today', (select count(distinct user_id) from public.activity_log
                       where created_at >= (now() - interval '1 day')),
    'active_week',  (select count(distinct user_id) from public.activity_log
                       where created_at >= (now() - interval '7 day')),
    'works',        (select count(*) from public.portfolio),
    'feedback_avg', (select round(avg(rating)::numeric, 1) from public.feedback where rating is not null),
    'feedback_n',   (select count(*) from public.feedback),
    'council',      (select count(*) from public.almas where council = true),
    'echoes',       (select count(*) from public.echoes),
    -- Espacio de Storage realmente usado (bytes), total y por bucket.
    'storage_bytes', (select coalesce(sum((metadata->>'size')::bigint), 0)
                        from storage.objects
                       where bucket_id in ('media','avatars','portfolio','temp')),
    'storage_limit_bytes', 10737418240,        -- 10 GB
    'storage_by_bucket', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'bucket', bucket_id, 'bytes', bytes, 'files', files) order by bytes desc), '[]'::jsonb)
        from (
          select bucket_id,
                 coalesce(sum((metadata->>'size')::bigint),0) as bytes,
                 count(*) as files
          from storage.objects
          where bucket_id in ('media','avatars','portfolio','temp')
          group by bucket_id
        ) b
    )
  ) into v_out;

  return v_out;
end;
$$;
revoke execute on function public.founder_stats() from public, anon;
grant  execute on function public.founder_stats() to authenticated;

-- Fin 0017.
