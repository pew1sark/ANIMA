-- =====================================================================
-- 0001c · Beta cerrada: invitaciones y feedback
--
-- RECUPERADA de supabase_migrations.schema_migrations (versión 20260619211026, «beta_invites_and_feedback»).
-- Ya está aplicada en producción: se aplicó a mano y nunca tuvo archivo.
-- Se agrega para que el repo reconstruya la base desde cero
-- (supabase/tests/reconstruir). El SQL va tal como se aplicó.
-- =====================================================================

-- ===========================================================
-- ANIMA — Beta cerrada: invitaciones + feedback
-- ===========================================================

-- INVITACIONES (acceso por invitación)
create table public.invites (
  code        text primary key,
  label       text,
  reusable    boolean default false,
  claimed_by  uuid references auth.users(id) on delete set null,
  claimed_at  timestamptz,
  created_at  timestamptz default now()
);
alter table public.invites enable row level security;
-- Sin acceso directo de tabla; sólo el dueño ve la suya. Todo lo demás vía RPC.
create policy "invites_select_own" on public.invites for select using (auth.uid() = claimed_by);

-- ¿Es un código válido? (no filtra datos, sólo true/false) — anon puede llamarlo en el registro
create or replace function public.check_invite(p_code text)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.invites
    where code = p_code and (reusable = true or claimed_by is null)
  );
$$;
revoke all on function public.check_invite(text) from public;
grant execute on function public.check_invite(text) to anon, authenticated;

-- Canjear invitación (marca de uso si no es reutilizable) — sólo autenticado
create or replace function public.redeem_invite(p_code text)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  -- código reutilizable: válido siempre, no se marca
  if exists (select 1 from public.invites where code = p_code and reusable = true) then
    return true;
  end if;
  update public.invites
     set claimed_by = auth.uid(), claimed_at = now()
   where code = p_code and claimed_by is null;
  get diagnostics n = row_count;
  return n > 0;
end; $$;
revoke all on function public.redeem_invite(text) from public, anon;
grant execute on function public.redeem_invite(text) to authenticated;

-- FEEDBACK (corazón de la beta)
create table public.feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid default auth.uid() references auth.users(id) on delete cascade,
  alma_name  text,
  rating     int,
  message    text,
  context    text,
  created_at timestamptz default now()
);
alter table public.feedback enable row level security;
create policy "fb_insert_auth" on public.feedback for insert with check (auth.uid() = user_id);
create policy "fb_select_own"  on public.feedback for select using (auth.uid() = user_id);

-- Código reutilizable para amigos cercanos + algunos de un solo uso
insert into public.invites (code, label, reusable) values
  ('ANIMA-2026', 'Beta cerrada · amigos cercanos', true);
insert into public.invites (code, label, reusable) values
  ('FUNDADOR-01','Invitación individual',false),
  ('FUNDADOR-02','Invitación individual',false),
  ('FUNDADOR-03','Invitación individual',false),
  ('FUNDADOR-04','Invitación individual',false),
  ('FUNDADOR-05','Invitación individual',false);
