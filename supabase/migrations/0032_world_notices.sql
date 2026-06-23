-- 0032 · La Voz del Mundo (avisos fijados) + Crónica: hitos recientes
-- Aditivo y seguro. Panel de avisos curado por el Creador (lectura pública).

create table if not exists public.world_notices (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  body       text,
  link       text,
  sort       int  not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references public.almas(id) on delete set null
);
alter table public.world_notices enable row level security;
drop policy if exists "world_notices read" on public.world_notices;
create policy "world_notices read" on public.world_notices for select using (true);
drop policy if exists "world_notices write" on public.world_notices;
create policy "world_notices write" on public.world_notices for insert
  with check (lower(coalesce(auth.jwt()->>'email','')) = 'sarkgraff@gmail.com');
drop policy if exists "world_notices update" on public.world_notices;
create policy "world_notices update" on public.world_notices for update
  using (lower(coalesce(auth.jwt()->>'email','')) = 'sarkgraff@gmail.com');
drop policy if exists "world_notices delete" on public.world_notices;
create policy "world_notices delete" on public.world_notices for delete
  using (lower(coalesce(auth.jwt()->>'email','')) = 'sarkgraff@gmail.com');

-- Crónica: registrar los hitos más relevantes ya integrados (sin duplicar).
insert into public.changelog(title, body, tag, created_at)
select v.title, v.body, v.tag, v.at
from (values
  ('Santuario PRO · El Fogón', 'Nuevo panel principal del Santuario (El Fogón) y pestañas para grupos grandes: Almas, Tareas, Proyectos, Calendario e Informes. Ingreso por código o invitación directa del Admin.', 'Santuario', now()),
  ('Clanes renovados', 'Fundar, editar y disolver Clanes; roles Admin · Líder · Alma; sumar a cualquier Alma del Mundo; abandonar cuando quieras. Plan de trabajo y calendario sincronizados.', 'Clan', now() - interval '1 day'),
  ('Esencia de crecimiento', 'Recompensas generosas en tus primeros pasos: nacer, completar tu Núcleo, tu primera obra, tu primera Huella y vincularte con otra Alma suman Esencia. Cobro único por Alma, en todos tus dispositivos.', 'Esencia', now() - interval '2 day'),
  ('Susurros y Constelaciones', 'Notificaciones cuando una Alma se vincula, da una Chispa o te envía una señal. Si el vínculo es mutuo, nace una Constelación.', 'Mundo', now() - interval '3 day')
) as v(title, body, tag, at)
where not exists (select 1 from public.changelog c where c.title = v.title);
