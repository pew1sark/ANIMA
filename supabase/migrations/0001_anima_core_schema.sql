-- =====================================================================
-- 0001 · El esquema con el que nació ANIMA: almas y sus módulos
--
-- RECUPERADA de supabase_migrations.schema_migrations (versión 20260619205921, «anima_core_schema»).
-- Ya está aplicada en producción: se aplicó a mano y nunca tuvo archivo.
-- Se agrega para que el repo reconstruya la base desde cero
-- (supabase/tests/reconstruir). El SQL va tal como se aplicó.
-- =====================================================================

-- ===========================================================
-- ANIMA TSC — Core schema (Founding Era)
-- Nivel 1 (Alma) + módulos, con privacidad por RLS.
-- ===========================================================

-- ALMAS (Nivel 1) — user_id NULL = Alma Fundadora sembrada
create table public.almas (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  slug        text unique,
  name        text not null,
  role        text,
  city        text,
  country     text,
  bio         text,
  color       text default '#111111',
  level       text default 'EMBER',
  xp          integer default 0,
  clan        text,
  tags        jsonb default '[]'::jsonb,
  is_founding boolean default false,
  created_at  timestamptz default now()
);
create index almas_user_id_idx on public.almas(user_id);

-- Módulos del Alma
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  alma_id uuid not null references public.almas(id) on delete cascade,
  title text, client text, status text default 'Planificado', pct integer default 0,
  created_at timestamptz default now()
);
create table public.finance_entries (
  id uuid primary key default gen_random_uuid(),
  alma_id uuid not null references public.almas(id) on delete cascade,
  kind text check (kind in ('income','expense')),
  title text, amount bigint default 0, period text,
  created_at timestamptz default now()
);
create table public.trajectory (
  id uuid primary key default gen_random_uuid(),
  alma_id uuid not null references public.almas(id) on delete cascade,
  year text, title text, detail text,
  created_at timestamptz default now()
);
create table public.portfolio (
  id uuid primary key default gen_random_uuid(),
  alma_id uuid not null references public.almas(id) on delete cascade,
  title text, kind text, color text default '#b8a892',
  created_at timestamptz default now()
);
create table public.memories (
  id uuid primary key default gen_random_uuid(),
  alma_id uuid not null references public.almas(id) on delete cascade,
  title text, detail text,
  created_at timestamptz default now()
);
create table public.library (
  id uuid primary key default gen_random_uuid(),
  alma_id uuid not null references public.almas(id) on delete cascade,
  title text, kind text,
  created_at timestamptz default now()
);
create table public.agenda (
  id uuid primary key default gen_random_uuid(),
  alma_id uuid not null references public.almas(id) on delete cascade,
  at_time text, title text,
  created_at timestamptz default now()
);

create index on public.projects(alma_id);
create index on public.finance_entries(alma_id);
create index on public.trajectory(alma_id);
create index on public.portfolio(alma_id);
create index on public.memories(alma_id);
create index on public.library(alma_id);
create index on public.agenda(alma_id);

-- ===========================================================
-- RLS — Privacidad: el Alma decide qué se comparte.
-- Público (constelación / cara pública): almas, trajectory, portfolio.
-- Privado (solo dueño): projects, finance, memories, library, agenda.
-- ===========================================================
alter table public.almas           enable row level security;
alter table public.projects        enable row level security;
alter table public.finance_entries enable row level security;
alter table public.trajectory      enable row level security;
alter table public.portfolio       enable row level security;
alter table public.memories        enable row level security;
alter table public.library         enable row level security;
alter table public.agenda          enable row level security;

-- Helper: ¿el Alma pertenece al usuario autenticado?
create or replace function public.owns_alma(a uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.almas where id = a and user_id = auth.uid());
$$;

-- ALMAS: lectura pública; escritura solo del dueño
create policy "almas_select_public" on public.almas for select using (true);
create policy "almas_insert_own"    on public.almas for insert with check (auth.uid() = user_id);
create policy "almas_update_own"    on public.almas for update using (auth.uid() = user_id);
create policy "almas_delete_own"    on public.almas for delete using (auth.uid() = user_id);

-- TRAJECTORY + PORTFOLIO: lectura pública; escritura del dueño del Alma
create policy "traj_select_public" on public.trajectory for select using (true);
create policy "traj_write_own"     on public.trajectory for all using (public.owns_alma(alma_id)) with check (public.owns_alma(alma_id));
create policy "port_select_public" on public.portfolio for select using (true);
create policy "port_write_own"     on public.portfolio for all using (public.owns_alma(alma_id)) with check (public.owns_alma(alma_id));

-- PRIVADOS: solo el dueño puede ver y escribir
create policy "proj_own" on public.projects        for all using (public.owns_alma(alma_id)) with check (public.owns_alma(alma_id));
create policy "fin_own"  on public.finance_entries for all using (public.owns_alma(alma_id)) with check (public.owns_alma(alma_id));
create policy "mem_own"  on public.memories        for all using (public.owns_alma(alma_id)) with check (public.owns_alma(alma_id));
create policy "lib_own"  on public.library         for all using (public.owns_alma(alma_id)) with check (public.owns_alma(alma_id));
create policy "age_own"  on public.agenda          for all using (public.owns_alma(alma_id)) with check (public.owns_alma(alma_id));

-- ===========================================================
-- Al registrarse un usuario, nace su Alma automáticamente.
-- ===========================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.almas (user_id, name, role, level, xp, bio)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
    'Creador',
    'EMBER',
    0,
    'Una nueva Alma en ANIMA. Aquí empieza tu trayectoria.'
  );
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
