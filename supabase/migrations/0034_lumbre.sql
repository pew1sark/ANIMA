-- ===========================================================
-- ANIMA TSC — Migración 0034: LUMBRE (Etapa 1, solo ADMIN/Creador)
--
-- Memoria de conversación, memoria de hechos y trazabilidad hacia
-- Obsidian para el motor agente LUMBRE. En esta etapa LUMBRE real
-- (conectada a un proveedor de IA) es exclusiva del Creador
-- (public.is_creator(), ya definida en 0005/0007) — el resto de
-- Almas siguen viendo el motor de reglas local existente.
--
-- CÓMO APLICAR:
--   Supabase → SQL Editor → New query → pega TODO este archivo → Run.
-- Es idempotente (se puede correr más de una vez sin romper nada).
-- Requiere 0005 (is_creator) y las tablas de 0002 (owns_alma, almas).
-- ===========================================================

-- ---------- 1. CONVERSACIONES DE LUMBRE ----------
create table if not exists public.lumbre_conversations (
  id uuid primary key default gen_random_uuid(),
  alma_id uuid not null references public.almas(id) on delete cascade,
  title text,
  created_at timestamptz default now()
);
create index if not exists lumbre_conversations_alma_idx on public.lumbre_conversations(alma_id);
alter table public.lumbre_conversations enable row level security;

drop policy if exists "lumbre_conversations_creator" on public.lumbre_conversations;
create policy "lumbre_conversations_creator" on public.lumbre_conversations for all
  using (public.is_creator()) with check (public.is_creator());

-- ---------- 2. MENSAJES DE LUMBRE ----------
create table if not exists public.lumbre_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.lumbre_conversations(id) on delete cascade,
  role text not null check (role in ('you','lum')),
  content text not null,
  created_at timestamptz default now()
);
create index if not exists lumbre_messages_conversation_idx on public.lumbre_messages(conversation_id);
alter table public.lumbre_messages enable row level security;

drop policy if exists "lumbre_messages_creator" on public.lumbre_messages;
create policy "lumbre_messages_creator" on public.lumbre_messages for all
  using (public.is_creator()) with check (public.is_creator());

-- ---------- 3. MEMORIA DE HECHOS DE LUMBRE ----------
-- Hechos puntuales que LUMBRE decide recordar entre sesiones (preferencias,
-- resúmenes, decisiones). No es el dump de datos del Alma — eso ya vive en
-- projects/finance_entries/clients/quotes/etc. Aquí solo lo que LUMBRE anota.
create table if not exists public.lumbre_memory (
  id uuid primary key default gen_random_uuid(),
  alma_id uuid not null references public.almas(id) on delete cascade,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  source text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index if not exists lumbre_memory_alma_key_idx on public.lumbre_memory(alma_id, key);
alter table public.lumbre_memory enable row level security;

drop policy if exists "lumbre_memory_own" on public.lumbre_memory;
create policy "lumbre_memory_own" on public.lumbre_memory for all
  using (public.owns_alma(alma_id) or public.is_creator())
  with check (public.owns_alma(alma_id) or public.is_creator());

-- ---------- 4. TRAZABILIDAD HACIA OBSIDIAN ----------
-- Vincula un registro real de ANIMA (proyecto, cliente, cotización…) con la
-- nota que LUMBRE escribió en el Vault local del Creador.
create table if not exists public.obsidian_links (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid not null,
  vault_path text not null,
  created_at timestamptz default now()
);
create index if not exists obsidian_links_record_idx on public.obsidian_links(table_name, record_id);
alter table public.obsidian_links enable row level security;

drop policy if exists "obsidian_links_creator" on public.obsidian_links;
create policy "obsidian_links_creator" on public.obsidian_links for all
  using (public.is_creator()) with check (public.is_creator());
