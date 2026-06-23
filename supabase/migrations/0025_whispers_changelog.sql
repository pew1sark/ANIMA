-- 0025 · Susurros (notificaciones por Alma) + Crónica (registro de mejoras)
-- Todo ADITIVO: tablas nuevas + RPCs ampliadas. No altera datos existentes.

-- ---------- SUSURROS (notificaciones) ----------
create table if not exists public.whispers (
  id                uuid primary key default gen_random_uuid(),
  recipient_alma_id uuid not null references public.almas(id) on delete cascade,
  actor_alma_id     uuid references public.almas(id) on delete set null,
  kind              text not null,                 -- vinculo | constelacion | chispa | senal
  text              text,
  post_id           uuid references public.posts(id) on delete set null,
  read              boolean not null default false,
  created_at        timestamptz not null default now()
);
alter table public.whispers enable row level security;
create index if not exists whispers_recipient_idx on public.whispers(recipient_alma_id, created_at desc);
drop policy if exists "whispers read own" on public.whispers;
create policy "whispers read own" on public.whispers for select
  using (exists (select 1 from public.almas a where a.id=recipient_alma_id and a.user_id=auth.uid()));
drop policy if exists "whispers update own" on public.whispers;
create policy "whispers update own" on public.whispers for update
  using (exists (select 1 from public.almas a where a.id=recipient_alma_id and a.user_id=auth.uid()));
-- Los inserts se hacen SOLO vía RPC (security definer): no abrimos insert directo.

-- ---------- CRÓNICA (registro de integraciones y mejoras) ----------
create table if not exists public.changelog (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  body       text,
  tag        text,
  created_at timestamptz not null default now()
);
alter table public.changelog enable row level security;
drop policy if exists "changelog public read" on public.changelog;
create policy "changelog public read" on public.changelog for select using (true);
drop policy if exists "changelog creator write" on public.changelog;
create policy "changelog creator write" on public.changelog for insert
  with check (lower(coalesce(auth.jwt() ->> 'email','')) = 'sarkgraff@gmail.com');
drop policy if exists "changelog creator delete" on public.changelog;
create policy "changelog creator delete" on public.changelog for delete
  using (lower(coalesce(auth.jwt() ->> 'email','')) = 'sarkgraff@gmail.com');

-- ---------- RPCs: generar Susurros en cada acción importante ----------
create or replace function public.toggle_follow(p_target uuid)
returns boolean language plpgsql security definer set search_path='public' as $$
declare v_me uuid; v_name text; v_exists boolean; v_mutual boolean;
begin
  select id, name into v_me, v_name from public.almas where user_id=auth.uid() limit 1;
  if v_me is null or v_me=p_target then return false; end if;
  select exists(select 1 from public.follows where follower_alma_id=v_me and following_alma_id=p_target) into v_exists;
  if v_exists then
    delete from public.follows where follower_alma_id=v_me and following_alma_id=p_target;
    return false;
  else
    insert into public.follows(follower_alma_id, following_alma_id) values(v_me,p_target) on conflict do nothing;
    select exists(select 1 from public.follows where follower_alma_id=p_target and following_alma_id=v_me) into v_mutual;
    insert into public.whispers(recipient_alma_id, actor_alma_id, kind, text)
      values(p_target, v_me,
        case when v_mutual then 'constelacion' else 'vinculo' end,
        case when v_mutual then split_part(coalesce(v_name,'Una Alma'),' ',1)||' también te vinculó — nació una Constelación'
             else split_part(coalesce(v_name,'Una Alma'),' ',1)||' se vinculó a tu Alma' end);
    return true;
  end if;
end; $$;
grant execute on function public.toggle_follow(uuid) to authenticated;

create or replace function public.toggle_post_spark(p_post uuid)
returns integer language plpgsql security definer set search_path='public' as $$
declare v_me uuid; v_name text; v_exists boolean; v_count integer; v_author uuid; v_title text;
begin
  select id, name into v_me, v_name from public.almas where user_id=auth.uid() limit 1;
  if v_me is null then return null; end if;
  select exists(select 1 from public.post_sparks where post_id=p_post and alma_id=v_me) into v_exists;
  if v_exists then
    delete from public.post_sparks where post_id=p_post and alma_id=v_me;
  else
    insert into public.post_sparks(post_id, alma_id) values(p_post,v_me) on conflict do nothing;
    select author_alma_id, coalesce(nullif(trim(title),''),'tu Huella') into v_author, v_title from public.posts where id=p_post;
    if v_author is not null and v_author <> v_me then
      insert into public.whispers(recipient_alma_id, actor_alma_id, kind, text, post_id)
        values(v_author, v_me, 'chispa', split_part(coalesce(v_name,'Una Alma'),' ',1)||' dio una Chispa a «'||v_title||'»', p_post);
    end if;
  end if;
  select count(*) into v_count from public.post_sparks where post_id=p_post;
  return v_count;
end; $$;
grant execute on function public.toggle_post_spark(uuid) to authenticated;

-- Señal: mensaje privado de Alma a Alma (genera un Susurro).
create or replace function public.send_signal(p_target uuid, p_text text)
returns boolean language plpgsql security definer set search_path='public' as $$
declare v_me uuid;
begin
  select id into v_me from public.almas where user_id=auth.uid() limit 1;
  if v_me is null or v_me=p_target or coalesce(trim(p_text),'')='' then return false; end if;
  insert into public.whispers(recipient_alma_id, actor_alma_id, kind, text)
    values(p_target, v_me, 'senal', left(p_text, 500));
  return true;
end; $$;
grant execute on function public.send_signal(uuid, text) to authenticated;

-- Marcar mis Susurros como leídos.
create or replace function public.mark_whispers_read()
returns void language plpgsql security definer set search_path='public' as $$
declare v_me uuid;
begin
  select id into v_me from public.almas where user_id=auth.uid() limit 1;
  if v_me is null then return; end if;
  update public.whispers set read=true where recipient_alma_id=v_me and read=false;
end; $$;
grant execute on function public.mark_whispers_read() to authenticated;

-- Primera entrada de la Crónica.
insert into public.changelog(title, body, tag)
select 'ANIMA sigue creciendo',
       'Llegan los Vínculos y las Constelaciones, las Chispas en las Huellas, fotos de perfil en el muro, fotos de proyecto en el Ritual y los Susurros: tu Alma ahora recibe avisos de lo importante.',
       'Mundo'
where not exists (select 1 from public.changelog);
