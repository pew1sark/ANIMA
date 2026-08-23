-- ===========================================================
-- 0043 · company_id en las tablas de trabajo de ANIMA (Creator)
-- -----------------------------------------------------------
-- Retrofit NO destructivo:
--   · la columna es OPCIONAL, así que anima.js sigue insertando igual
--   · un disparador la completa sola a partir del Alma que inserta
--   · las políticas por alma_id quedan intactas; la de empresa se
--     añade en paralelo (las permisivas se combinan con OR)
--
-- Verificado (7/7): un usuario de otra empresa no ve proyectos, clientes
-- ni finanzas de ANIMA; insertar sin company_id lo completa el disparador;
-- ANIMA sigue viendo sus 29 proyectos.
-- ===========================================================
alter table public.projects        add column if not exists company_id uuid references public.companies(id) on delete cascade;
alter table public.clients         add column if not exists company_id uuid references public.companies(id) on delete cascade;
alter table public.quotes          add column if not exists company_id uuid references public.companies(id) on delete cascade;
alter table public.finance_entries add column if not exists company_id uuid references public.companies(id) on delete cascade;
alter table public.agenda          add column if not exists company_id uuid references public.companies(id) on delete cascade;
alter table public.tasks           add column if not exists company_id uuid references public.companies(id) on delete cascade;

create index if not exists projects_company_idx        on public.projects(company_id);
create index if not exists clients_company_idx         on public.clients(company_id);
create index if not exists quotes_company_idx          on public.quotes(company_id);
create index if not exists finance_entries_company_idx on public.finance_entries(company_id);
create index if not exists agenda_company_idx          on public.agenda(company_id);
create index if not exists tasks_company_idx           on public.tasks(company_id);

-- Relleno: todo lo que existe hoy es el Taller de ANIMA.
update public.projects        set company_id = (select id from public.companies where slug='anima') where company_id is null;
update public.clients         set company_id = (select id from public.companies where slug='anima') where company_id is null;
update public.quotes          set company_id = (select id from public.companies where slug='anima') where company_id is null;
update public.finance_entries set company_id = (select id from public.companies where slug='anima') where company_id is null;
update public.agenda          set company_id = (select id from public.companies where slug='anima') where company_id is null;
update public.tasks           set company_id = (select id from public.companies where slug='anima') where company_id is null;

create or replace function public.set_company_from_alma()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.company_id is null and new.alma_id is not null then
    select cm.company_id into new.company_id
    from public.almas a
    join public.company_members cm on cm.user_id = a.user_id and cm.status = 'active'
    where a.id = new.alma_id
    order by cm.created_at asc
    limit 1;
  end if;
  return new;
end $$;
revoke execute on function public.set_company_from_alma() from public, anon, authenticated;

drop trigger if exists projects_set_company        on public.projects;
drop trigger if exists clients_set_company         on public.clients;
drop trigger if exists quotes_set_company          on public.quotes;
drop trigger if exists finance_entries_set_company on public.finance_entries;
drop trigger if exists agenda_set_company          on public.agenda;
drop trigger if exists tasks_set_company           on public.tasks;
create trigger projects_set_company        before insert on public.projects        for each row execute function public.set_company_from_alma();
create trigger clients_set_company         before insert on public.clients         for each row execute function public.set_company_from_alma();
create trigger quotes_set_company          before insert on public.quotes          for each row execute function public.set_company_from_alma();
create trigger finance_entries_set_company before insert on public.finance_entries for each row execute function public.set_company_from_alma();
create trigger agenda_set_company          before insert on public.agenda          for each row execute function public.set_company_from_alma();
create trigger tasks_set_company           before insert on public.tasks           for each row execute function public.set_company_from_alma();

drop policy if exists projects_company        on public.projects;
drop policy if exists clients_company         on public.clients;
drop policy if exists quotes_company          on public.quotes;
drop policy if exists finance_entries_company on public.finance_entries;
drop policy if exists agenda_company          on public.agenda;
drop policy if exists tasks_company           on public.tasks;

create policy projects_company on public.projects for all to authenticated
  using (company_id is not null and public.has_company_level(company_id, 40))
  with check (company_id is not null and public.has_company_level(company_id, 40));
create policy clients_company on public.clients for all to authenticated
  using (company_id is not null and public.has_company_level(company_id, 40))
  with check (company_id is not null and public.has_company_level(company_id, 40));
create policy quotes_company on public.quotes for all to authenticated
  using (company_id is not null and public.has_company_level(company_id, 40))
  with check (company_id is not null and public.has_company_level(company_id, 40));
-- Las finanzas exigen encargado (60): no todo el equipo ve el dinero.
create policy finance_entries_company on public.finance_entries for all to authenticated
  using (company_id is not null and public.has_company_level(company_id, 60))
  with check (company_id is not null and public.has_company_level(company_id, 60));
create policy agenda_company on public.agenda for all to authenticated
  using (company_id is not null and public.has_company_level(company_id, 40))
  with check (company_id is not null and public.has_company_level(company_id, 40));
create policy tasks_company on public.tasks for all to authenticated
  using (company_id is not null and public.has_company_level(company_id, 40))
  with check (company_id is not null and public.has_company_level(company_id, 40));
