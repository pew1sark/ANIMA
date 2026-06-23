-- 0023 · Comunidad viva: Vínculos (seguir) + Chispas por Huella
-- ===========================================================
-- follows      → un Alma "vincula" (sigue) a otra. Si el vínculo es mutuo,
--                las dos Almas forman una Constelación.
-- post_sparks  → una Chispa por Alma por Huella (post). Máx. 1, alternable.
-- RPC toggle_* → alternan de forma segura usando el Alma del usuario actual.
-- ===========================================================

-- ---------- VÍNCULOS (seguir) ----------
create table if not exists public.follows (
  follower_alma_id  uuid not null references public.almas(id) on delete cascade,
  following_alma_id uuid not null references public.almas(id) on delete cascade,
  created_at        timestamptz not null default now(),
  primary key (follower_alma_id, following_alma_id),
  check (follower_alma_id <> following_alma_id)
);
alter table public.follows enable row level security;
drop policy if exists "follows readable" on public.follows;
create policy "follows readable" on public.follows for select using (true);
drop policy if exists "follows insert own" on public.follows;
create policy "follows insert own" on public.follows for insert
  with check (exists (select 1 from public.almas a where a.id = follower_alma_id and a.user_id = auth.uid()));
drop policy if exists "follows delete own" on public.follows;
create policy "follows delete own" on public.follows for delete
  using (exists (select 1 from public.almas a where a.id = follower_alma_id and a.user_id = auth.uid()));

-- ---------- CHISPAS POR HUELLA ----------
create table if not exists public.post_sparks (
  post_id    uuid not null references public.posts(id) on delete cascade,
  alma_id    uuid not null references public.almas(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, alma_id)
);
alter table public.post_sparks enable row level security;
drop policy if exists "post_sparks readable" on public.post_sparks;
create policy "post_sparks readable" on public.post_sparks for select using (true);
drop policy if exists "post_sparks insert own" on public.post_sparks;
create policy "post_sparks insert own" on public.post_sparks for insert
  with check (exists (select 1 from public.almas a where a.id = alma_id and a.user_id = auth.uid()));
drop policy if exists "post_sparks delete own" on public.post_sparks;
create policy "post_sparks delete own" on public.post_sparks for delete
  using (exists (select 1 from public.almas a where a.id = alma_id and a.user_id = auth.uid()));

-- ---------- RPC: vincular / desvincular (toggle) ----------
create or replace function public.toggle_follow(p_target uuid)
returns boolean language plpgsql security definer set search_path='public' as $$
declare v_me uuid; v_exists boolean;
begin
  select id into v_me from public.almas where user_id = auth.uid() limit 1;
  if v_me is null or v_me = p_target then return false; end if;
  select exists(select 1 from public.follows where follower_alma_id=v_me and following_alma_id=p_target) into v_exists;
  if v_exists then
    delete from public.follows where follower_alma_id=v_me and following_alma_id=p_target;
    return false;
  else
    insert into public.follows(follower_alma_id, following_alma_id) values (v_me, p_target) on conflict do nothing;
    return true;
  end if;
end; $$;
grant execute on function public.toggle_follow(uuid) to authenticated;

-- ---------- RPC: chispa a una Huella (toggle, máx. 1) ----------
create or replace function public.toggle_post_spark(p_post uuid)
returns integer language plpgsql security definer set search_path='public' as $$
declare v_me uuid; v_exists boolean; v_count integer;
begin
  select id into v_me from public.almas where user_id = auth.uid() limit 1;
  if v_me is null then return null; end if;
  select exists(select 1 from public.post_sparks where post_id=p_post and alma_id=v_me) into v_exists;
  if v_exists then
    delete from public.post_sparks where post_id=p_post and alma_id=v_me;
  else
    insert into public.post_sparks(post_id, alma_id) values (p_post, v_me) on conflict do nothing;
  end if;
  select count(*) into v_count from public.post_sparks where post_id=p_post;
  return v_count;
end; $$;
grant execute on function public.toggle_post_spark(uuid) to authenticated;
