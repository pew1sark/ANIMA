-- ===========================================================
-- ANIMA TSC — Migración PRO (registros detallados, clientes,
-- cotizaciones, comunidad y preferencias)
--
-- CÓMO APLICAR:
--   Supabase → SQL Editor → New query → pega TODO este archivo → Run.
-- Es idempotente (se puede correr más de una vez sin romper nada).
-- ===========================================================

-- ---------- 1. REGISTROS DETALLADOS (más campos por elemento) ----------
alter table public.projects        add column if not exists description text;
alter table public.projects        add column if not exists started_at date;
alter table public.projects        add column if not exists due_at date;
alter table public.projects        add column if not exists budget bigint;
alter table public.projects        add column if not exists tags jsonb default '[]'::jsonb;
alter table public.projects        add column if not exists client_id uuid;

alter table public.finance_entries add column if not exists category text;
alter table public.finance_entries add column if not exists occurred_at date;
alter table public.finance_entries add column if not exists method text;
alter table public.finance_entries add column if not exists notes text;
alter table public.finance_entries add column if not exists project_id uuid;

alter table public.portfolio       add column if not exists year text;
alter table public.portfolio       add column if not exists link text;
alter table public.portfolio       add column if not exists description text;

alter table public.library         add column if not exists url text;
alter table public.library         add column if not exists notes text;

alter table public.memories        add column if not exists tags jsonb default '[]'::jsonb;
alter table public.agenda          add column if not exists on_date date;
alter table public.agenda          add column if not exists notes text;

-- ---------- 2. CLIENTES ----------
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  alma_id uuid not null references public.almas(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  notes text,
  created_at timestamptz default now()
);
create index if not exists clients_alma_idx on public.clients(alma_id);
alter table public.clients enable row level security;
drop policy if exists "clients_own" on public.clients;
create policy "clients_own" on public.clients for all
  using (public.owns_alma(alma_id)) with check (public.owns_alma(alma_id));

-- ---------- 3. COTIZACIONES ----------
create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  alma_id uuid not null references public.almas(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  title text,
  client_name text,
  discipline text,
  currency text default 'CLP',
  tax_pct numeric default 0,
  notes text,
  items jsonb default '[]'::jsonb,
  subtotal bigint default 0,
  total bigint default 0,
  status text default 'Borrador',
  created_at timestamptz default now()
);
create index if not exists quotes_alma_idx on public.quotes(alma_id);
alter table public.quotes enable row level security;
drop policy if exists "quotes_own" on public.quotes;
create policy "quotes_own" on public.quotes for all
  using (public.owns_alma(alma_id)) with check (public.owns_alma(alma_id));

-- ---------- 4. PREFERENCIAS (personalización sincronizada) ----------
create table if not exists public.preferences (
  alma_id uuid primary key references public.almas(id) on delete cascade,
  data jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);
alter table public.preferences enable row level security;
drop policy if exists "prefs_own" on public.preferences;
create policy "prefs_own" on public.preferences for all
  using (public.owns_alma(alma_id)) with check (public.owns_alma(alma_id));

-- ---------- 5. COMUNIDAD (posts / hilos + comentarios) ----------
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_alma_id uuid not null references public.almas(id) on delete cascade,
  kind text default 'post',            -- 'post' | 'thread'
  title text,
  body text,
  tags jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);
create index if not exists posts_created_idx on public.posts(created_at desc);
alter table public.posts enable row level security;
-- Lectura pública (feed de la comunidad); escritura sólo del autor.
drop policy if exists "posts_select_public" on public.posts;
create policy "posts_select_public" on public.posts for select using (true);
drop policy if exists "posts_write_own" on public.posts;
create policy "posts_write_own" on public.posts for all
  using (public.owns_alma(author_alma_id)) with check (public.owns_alma(author_alma_id));

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_alma_id uuid not null references public.almas(id) on delete cascade,
  body text,
  created_at timestamptz default now()
);
create index if not exists comments_post_idx on public.comments(post_id, created_at);
alter table public.comments enable row level security;
drop policy if exists "comments_select_public" on public.comments;
create policy "comments_select_public" on public.comments for select using (true);
drop policy if exists "comments_write_own" on public.comments;
create policy "comments_write_own" on public.comments for all
  using (public.owns_alma(author_alma_id)) with check (public.owns_alma(author_alma_id));

-- Likes opcionales (para futuro)
create table if not exists public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  alma_id uuid not null references public.almas(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (post_id, alma_id)
);
alter table public.post_likes enable row level security;
drop policy if exists "likes_select_public" on public.post_likes;
create policy "likes_select_public" on public.post_likes for select using (true);
drop policy if exists "likes_write_own" on public.post_likes;
create policy "likes_write_own" on public.post_likes for all
  using (public.owns_alma(alma_id)) with check (public.owns_alma(alma_id));

-- Fin de la migración PRO.
