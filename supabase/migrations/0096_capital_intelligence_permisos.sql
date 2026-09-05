-- ===========================================================
-- 0096 · CAPITAL INTELLIGENCE — permisos, borrado lógico y registro
-- -----------------------------------------------------------
-- Tres cosas que van juntas porque se explican juntas:
--
-- 1 · QUIÉN VE QUÉ. El aislamiento por empresa no basta aquí. Un
--     inversionista entra a la organización del asesor para ver UN
--     proyecto; un analista carga datos de los suyos. Por eso las
--     políticas no preguntan solo "¿eres de esta empresa?" sino
--     "¿este proyecto es tuyo?" (ci_ve_proyecto / ci_edita_proyecto).
--
--     Desde nivel 60 —asesor financiero, director, admin— se ven
--     todos los proyectos de la organización. Por debajo, solo los
--     que `ci_project_members` autoriza. Esa es la diferencia entre
--     un socio y un inversionista invitado.
--
--     El Super Admin de plataforma NO entra. Igual que en 0073: los
--     proyectos y sus modelos son operación del cliente, y quien
--     mantiene el software no es dueño de las cifras de sus rondas.
--
-- 2 · BORRADO LÓGICO. El motor de datos hace DELETE de verdad
--     (datos.service.ts). Aquí un DELETE se convierte en
--     `deleted_at = now()` mediante un trigger que devuelve null, y
--     las políticas de lectura esconden lo borrado. El frontend no
--     cambia ni una línea y nada se pierde: en un expediente de
--     inversión, borrar sin rastro no es una opción.
--
-- 3 · REGISTRO DEL MÓDULO. `capital`, en el plan Enterprise.
-- ===========================================================

-- ---------- 1 · ¿PUEDE VER ESTE PROYECTO? ----------
create or replace function public.ci_ve_proyecto(p_project uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.ci_projects p
     where p.id = p_project
       and p.deleted_at is null
       and ( public.has_company_level(p.company_id, 60)
             or exists (select 1 from public.ci_project_members m
                         where m.project_id = p.id
                           and m.user_id = (select auth.uid())) )
  );
$$;
comment on function public.ci_ve_proyecto(uuid) is
  'Desde nivel 60 se ven todos los proyectos de la organización; por debajo, solo los que ci_project_members autoriza.';

create or replace function public.ci_edita_proyecto(p_project uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.ci_projects p
     where p.id = p_project
       and p.deleted_at is null
       and ( public.has_company_level(p.company_id, 60)
             or exists (select 1 from public.ci_project_members m
                         where m.project_id = p.id
                           and m.user_id = (select auth.uid())
                           and m.access in ('colaborador','responsable')) )
  );
$$;
comment on function public.ci_edita_proyecto(uuid) is
  'Escribir exige nivel 60 o ser colaborador/responsable del proyecto. Un lector invitado no escribe nunca.';

revoke execute on function public.ci_ve_proyecto(uuid)    from public, anon;
revoke execute on function public.ci_edita_proyecto(uuid) from public, anon;
grant  execute on function public.ci_ve_proyecto(uuid)    to authenticated;
grant  execute on function public.ci_edita_proyecto(uuid) to authenticated;

-- ---------- 2 · BORRADO LÓGICO ----------
create or replace function public.ci_borrado_logico()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  execute format('update public.%I set deleted_at = now() where id = $1 and deleted_at is null', tg_table_name)
    using old.id;
  return null;   -- null cancela el DELETE físico
end $$;
revoke execute on function public.ci_borrado_logico() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['ci_portfolios','ci_projects','ci_business_units','ci_milestones'] loop
    execute format('drop trigger if exists %I on public.%I', t||'_soft_delete', t);
    execute format('create trigger %I before delete on public.%I
                    for each row execute function public.ci_borrado_logico()', t||'_soft_delete', t);
  end loop;
end $$;

-- ---------- 3 · RLS ----------
alter table public.ci_portfolios      enable row level security;
alter table public.ci_projects        enable row level security;
alter table public.ci_business_units  enable row level security;
alter table public.ci_project_members enable row level security;
alter table public.ci_milestones      enable row level security;

-- Portafolios: los ve entero quien manda; el invitado ve el que
-- contiene su proyecto, para que la ficha no diga "portafolio: —".
drop policy if exists ci_portfolios_leer   on public.ci_portfolios;
drop policy if exists ci_portfolios_crear  on public.ci_portfolios;
drop policy if exists ci_portfolios_editar on public.ci_portfolios;
drop policy if exists ci_portfolios_borrar on public.ci_portfolios;

create policy ci_portfolios_leer on public.ci_portfolios for select to authenticated
  using (deleted_at is null and (
    public.has_company_level(company_id, 60)
    or exists (select 1 from public.ci_projects p
                where p.portfolio_id = ci_portfolios.id and p.deleted_at is null
                  and exists (select 1 from public.ci_project_members m
                               where m.project_id = p.id and m.user_id = (select auth.uid())))));
create policy ci_portfolios_crear on public.ci_portfolios for insert to authenticated
  with check (public.has_company_level(company_id, 60));
create policy ci_portfolios_editar on public.ci_portfolios for update to authenticated
  using (public.has_company_level(company_id, 60))
  with check (public.has_company_level(company_id, 60));
create policy ci_portfolios_borrar on public.ci_portfolios for delete to authenticated
  using (public.has_company_level(company_id, 60));

-- Proyectos
drop policy if exists ci_projects_leer   on public.ci_projects;
drop policy if exists ci_projects_crear  on public.ci_projects;
drop policy if exists ci_projects_editar on public.ci_projects;
drop policy if exists ci_projects_borrar on public.ci_projects;

create policy ci_projects_leer on public.ci_projects for select to authenticated
  using (deleted_at is null and public.ci_ve_proyecto(id));
create policy ci_projects_crear on public.ci_projects for insert to authenticated
  with check (public.has_company_level(company_id, 60));
create policy ci_projects_editar on public.ci_projects for update to authenticated
  using (public.ci_edita_proyecto(id))
  with check (public.ci_edita_proyecto(id));
-- Borrar un proyecto entero es de administración, no de operación.
create policy ci_projects_borrar on public.ci_projects for delete to authenticated
  using (public.has_company_level(company_id, 80));

-- Unidades de negocio e hitos: siguen al proyecto del que cuelgan.
do $$
declare t text;
begin
  foreach t in array array['ci_business_units','ci_milestones'] loop
    execute format('drop policy if exists %I on public.%I', t||'_leer', t);
    execute format('drop policy if exists %I on public.%I', t||'_escribir', t);
    execute format('drop policy if exists %I on public.%I', t||'_editar', t);
    execute format('drop policy if exists %I on public.%I', t||'_borrar', t);

    execute format($p$create policy %I on public.%I for select to authenticated
      using (deleted_at is null and public.ci_ve_proyecto(project_id))$p$, t||'_leer', t);
    execute format($p$create policy %I on public.%I for insert to authenticated
      with check (public.ci_edita_proyecto(project_id))$p$, t||'_escribir', t);
    execute format($p$create policy %I on public.%I for update to authenticated
      using (public.ci_edita_proyecto(project_id))
      with check (public.ci_edita_proyecto(project_id))$p$, t||'_editar', t);
    execute format($p$create policy %I on public.%I for delete to authenticated
      using (public.ci_edita_proyecto(project_id))$p$, t||'_borrar', t);
  end loop;
end $$;

-- Quién ve qué proyecto: lo administra el asesor, y cada persona ve
-- su propia línea (para saber a qué la invitaron).
drop policy if exists ci_project_members_leer     on public.ci_project_members;
drop policy if exists ci_project_members_escribir on public.ci_project_members;

create policy ci_project_members_leer on public.ci_project_members for select to authenticated
  using (public.has_company_level(company_id, 60) or user_id = (select auth.uid()));
create policy ci_project_members_escribir on public.ci_project_members for all to authenticated
  using (public.has_company_level(company_id, 60))
  with check (public.has_company_level(company_id, 60));

-- ---------- 4 · EL MÓDULO ----------
insert into public.modules (slug, name, description, active, sort)
values ('capital', 'Capital Intelligence',
        'Sistema centralizado para analizar proyectos, controlar su desempeño financiero, construir escenarios y gestionar levantamientos de capital.',
        true, 120)
on conflict (slug) do update
   set name = excluded.name, description = excluded.description,
       active = excluded.active, sort = excluded.sort;

-- Solo Enterprise. Es el módulo que justifica el plan.
insert into public.plan_modules (plan_id, module_id, max_tier)
select p.id, m.id, 'enterprise'::public.module_tier
  from public.plans p
  join public.product_lines pl on pl.id = p.product_line_id and pl.slug = 'company'
  cross join public.modules m
 where p.slug = 'enterprise' and m.slug = 'capital'
on conflict (plan_id, module_id) do update set max_tier = excluded.max_tier;
