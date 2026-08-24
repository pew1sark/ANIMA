-- ===========================================================
-- 0045 · MÓDULO LEVANTAMIENTO
-- -----------------------------------------------------------
-- En JLIZ el cuestionario vive en src/lib/survey.ts: 932 líneas de código
-- generado desde un Excel. Eso obliga a programar y desplegar por cada
-- rubro nuevo. Aquí el cuestionario es DATO: una plantilla por rubro.
--
-- Y cierra el círculo: las respuestas no solo se guardan, CONFIGURAN la
-- empresa. Reglas → módulos encendidos y ajustes. El levantamiento deja de
-- ser un formulario y pasa a ser el instalador del sistema.
--
-- El contenido del cuestionario está en supabase/seed/.
-- ===========================================================

create table if not exists public.survey_templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, name text not null, sector text,
  version int not null default 1, description text,
  definition jsonb not null default '[]'::jsonb,   -- secciones → bloques → preguntas
  rules      jsonb not null default '[]'::jsonb,   -- [{question_id, operator, value, effect}]
  active boolean not null default true,
  created_at timestamptz not null default now()
);
comment on table public.survey_templates is 'El cuestionario como dato. Un rubro nuevo es una fila, no un despliegue.';

create table if not exists public.survey_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id  uuid references public.companies(id) on delete cascade,
  template_id uuid references public.survey_templates(id) on delete set null,
  token text not null unique,
  client_name text not null default 'Cliente', business_name text,
  status text not null default 'abierta', notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz, submitted_at timestamptz, applied_at timestamptz
);
comment on column public.survey_sessions.company_id is 'Nulo mientras es un prospecto: el levantamiento puede empezar antes de que exista la empresa.';

create table if not exists public.survey_answers (
  session_id uuid not null references public.survey_sessions(id) on delete cascade,
  question_id text not null, answer text not null default '',
  updated_at timestamptz not null default now(),
  primary key (session_id, question_id)
);

create table if not exists public.intake_rows (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.survey_sessions(id) on delete cascade,
  kind text not null, position int not null default 0,
  data jsonb not null default '{}'::jsonb,
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists survey_sessions_company_idx    on public.survey_sessions(company_id);
create index if not exists survey_sessions_template_idx   on public.survey_sessions(template_id);
create index if not exists survey_sessions_created_by_idx on public.survey_sessions(created_by);
create index if not exists survey_answers_session_idx     on public.survey_answers(session_id);
create index if not exists intake_rows_session_idx        on public.intake_rows(session_id, kind);

drop trigger if exists intake_rows_touch on public.intake_rows;
create trigger intake_rows_touch before update on public.intake_rows
  for each row execute function public.touch_updated_at();

-- ---------- El levantamiento configura la empresa ----------
create or replace function public.survey_apply(p_session uuid)
returns table(regla text, efecto text, resultado text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_company uuid; v_rules jsonb; r jsonb; v_ans text; v_ok boolean; v_mod uuid;
begin
  select s.company_id, t.rules into v_company, v_rules
  from public.survey_sessions s
  left join public.survey_templates t on t.id = s.template_id
  where s.id = p_session;

  if v_company is null then
    regla:='—'; efecto:='—'; resultado:='La sesión no está asociada a ninguna empresa'; return next; return;
  end if;
  if not public.has_company_level(v_company, 80) then
    raise exception 'Se requiere nivel administrador en la empresa';
  end if;

  for r in select * from jsonb_array_elements(coalesce(v_rules,'[]'::jsonb)) loop
    select a.answer into v_ans from public.survey_answers a
    where a.session_id = p_session and a.question_id = r->>'question_id';

    v_ok := case r->>'operator'
              when 'answered'  then coalesce(v_ans,'') <> ''
              when 'equals'    then lower(coalesce(v_ans,'')) = lower(r->>'value')
              when 'contains'  then lower(coalesce(v_ans,'')) like '%'||lower(r->>'value')||'%'
              when 'not_empty' then coalesce(v_ans,'') <> ''
              else false end;

    regla := (r->>'question_id')||' '||(r->>'operator')||' '||coalesce(r->>'value','');

    if v_ok and r->'effect' ? 'module' then
      select id into v_mod from public.modules where slug = r->'effect'->>'module';
      if v_mod is not null then
        insert into public.company_modules (company_id, module_id, enabled)
        values (v_company, v_mod, coalesce((r->'effect'->>'enable')::boolean, true))
        on conflict (company_id, module_id) do update set enabled = excluded.enabled, updated_at = now();
        efecto := 'módulo '||(r->'effect'->>'module'); resultado := 'aplicada'; return next;
      end if;
    elsif v_ok and r->'effect' ? 'setting' then
      update public.companies
         set settings = jsonb_set(settings, array[r->'effect'->>'setting'], to_jsonb(coalesce(v_ans,'')), true)
       where id = v_company;
      efecto := 'ajuste '||(r->'effect'->>'setting'); resultado := 'aplicada'; return next;
    else
      efecto := coalesce(r->'effect'->>'module', r->'effect'->>'setting', '—'); resultado := 'no cumple'; return next;
    end if;
  end loop;

  update public.survey_sessions set applied_at = now() where id = p_session;
end $$;
revoke execute on function public.survey_apply(uuid) from public, anon;
grant  execute on function public.survey_apply(uuid) to authenticated;

-- ---------- RLS ----------
alter table public.survey_templates enable row level security;
alter table public.survey_sessions  enable row level security;
alter table public.survey_answers   enable row level security;
alter table public.intake_rows      enable row level security;

drop policy if exists survey_templates_read on public.survey_templates;
create policy survey_templates_read on public.survey_templates for select to authenticated using (active);
drop policy if exists survey_templates_write on public.survey_templates;
create policy survey_templates_write on public.survey_templates for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists survey_sessions_rw on public.survey_sessions;
create policy survey_sessions_rw on public.survey_sessions for all to authenticated
  using ((company_id is not null and public.has_company_level(company_id, 80)) or public.is_platform_admin())
  with check ((company_id is not null and public.has_company_level(company_id, 80)) or public.is_platform_admin());

drop policy if exists survey_answers_rw on public.survey_answers;
create policy survey_answers_rw on public.survey_answers for all to authenticated
  using (exists (select 1 from public.survey_sessions s where s.id = session_id
                 and ((s.company_id is not null and public.has_company_level(s.company_id, 80)) or public.is_platform_admin())))
  with check (exists (select 1 from public.survey_sessions s where s.id = session_id
                 and ((s.company_id is not null and public.has_company_level(s.company_id, 80)) or public.is_platform_admin())));

drop policy if exists intake_rows_rw on public.intake_rows;
create policy intake_rows_rw on public.intake_rows for all to authenticated
  using (exists (select 1 from public.survey_sessions s where s.id = session_id
                 and ((s.company_id is not null and public.has_company_level(s.company_id, 80)) or public.is_platform_admin())))
  with check (exists (select 1 from public.survey_sessions s where s.id = session_id
                 and ((s.company_id is not null and public.has_company_level(s.company_id, 80)) or public.is_platform_admin())));
