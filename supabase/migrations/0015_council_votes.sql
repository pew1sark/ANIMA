-- ===========================================================
-- ANIMA TSC — Migración 0015: Consejo de Almas (Votaciones)
--
-- "Las primeras Almas ayudaron a escribir la historia de ANIMA."
-- El Consejo (las primeras 50 Almas, almas.council = true) puede:
--   · Proponer funciones      → public.proposals
--   · Votar cambios           → public.votes  (a favor / en contra)
--
-- Lectura pública de propuestas y votos (transparencia del Consejo);
-- la escritura pasa por funciones security definer que exigen Consejo.
--
-- CÓMO APLICAR:
--   Supabase → SQL Editor → New query → pega TODO → Run.  (Idempotente)
-- ===========================================================

-- ---------- 1. Propuestas ----------
create table if not exists public.proposals (
  id             uuid primary key default gen_random_uuid(),
  author_user_id uuid references auth.users(id) on delete set null,
  title          text not null,
  description    text,
  status         text not null default 'abierta',   -- abierta | cerrada
  created_at     timestamptz not null default now()
);
create index if not exists proposals_created_idx on public.proposals(created_at desc);
alter table public.proposals enable row level security;
drop policy if exists "proposals_public_read" on public.proposals;
create policy "proposals_public_read" on public.proposals for select using (true);

-- ---------- 2. Votos ----------
create table if not exists public.votes (
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  value       smallint not null default 1,          -- +1 a favor · -1 en contra
  created_at  timestamptz not null default now(),
  primary key (proposal_id, user_id)
);
alter table public.votes enable row level security;
drop policy if exists "votes_public_read" on public.votes;
create policy "votes_public_read" on public.votes for select using (true);

-- ---------- 3. Proponer (solo Consejo) ----------
create or replace function public.create_proposal(p_title text, p_desc text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_council boolean; v_name text; v_ctry text; v_alma uuid; v_id uuid;
begin
  select council, name, country, id into v_council, v_name, v_ctry, v_alma
    from public.almas where user_id = auth.uid();
  if not coalesce(v_council, false) then
    raise exception 'Solo el Consejo de Almas puede proponer.';
  end if;
  insert into public.proposals (author_user_id, title, description)
  values (auth.uid(), p_title, p_desc) returning id into v_id;

  insert into public.soul_timeline (user_id, event_type, title, description)
  values (auth.uid(), 'consejo', 'Propusiste una idea al Consejo', p_title);

  insert into public.echoes (alma_id, alma_name, country, kind, text)
  values (v_alma, split_part(coalesce(v_name,'Alma'),' ',1), v_ctry, 'consejo',
          '✦ ' || split_part(coalesce(v_name,'Alma'),' ',1) || ' propuso una idea al Consejo');
  return v_id;
end;
$$;
revoke execute on function public.create_proposal(text, text) from public, anon;
grant  execute on function public.create_proposal(text, text) to authenticated;

-- ---------- 4. Votar (solo Consejo, un voto por Alma) ----------
create or replace function public.cast_vote(p_proposal uuid, p_value integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_council boolean;
begin
  select council into v_council from public.almas where user_id = auth.uid();
  if not coalesce(v_council, false) then
    raise exception 'Solo el Consejo de Almas puede votar.';
  end if;
  insert into public.votes (proposal_id, user_id, value)
  values (p_proposal, auth.uid(), sign(p_value)::smallint)
  on conflict (proposal_id, user_id)
  do update set value = excluded.value, created_at = now();
end;
$$;
revoke execute on function public.cast_vote(uuid, integer) from public, anon;
grant  execute on function public.cast_vote(uuid, integer) to authenticated;

-- ---------- 5. Listado con conteos y mi voto ----------
create or replace function public.list_proposals()
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'title', p.title,
    'description', p.description,
    'status', p.status,
    'created_at', p.created_at,
    'favor',  (select count(*) from public.votes v where v.proposal_id = p.id and v.value > 0),
    'contra', (select count(*) from public.votes v where v.proposal_id = p.id and v.value < 0),
    'my_vote',(select v.value from public.votes v where v.proposal_id = p.id and v.user_id = auth.uid())
  ) order by p.created_at desc), '[]'::jsonb)
  from public.proposals p;
$$;
revoke execute on function public.list_proposals() from public, anon;
grant  execute on function public.list_proposals() to authenticated;

-- Fin 0015.
