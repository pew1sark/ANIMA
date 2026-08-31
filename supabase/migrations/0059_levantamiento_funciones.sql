-- 0059 · LEVANTAMIENTO · funciones por token
-- Estas son las UNICAS funciones que se conceden a anon, y es deliberado:
-- el cliente responde el cuestionario sin tener cuenta. El token (24 caracteres
-- aleatorios) es la credencial, y solo abre SU sesion. Por eso siguen siendo
-- SECURITY DEFINER: sin sesion no hay RLS que las filtre.
--
-- Cambios respecto al original: las notificaciones llevan company_id cuando la
-- sesion ya esta asociada a una empresa (puede no estarlo: un levantamiento
-- puede empezar cuando el cliente todavia es un prospecto).

create or replace function public.survey_get(_token text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s record; v_answers jsonb; v_def jsonb;
begin
  select * into s from public.survey_sessions where token = _token;
  if s is null then return jsonb_build_object('ok', false, 'error', 'Enlace no valido'); end if;

  select coalesce(jsonb_object_agg(question_id, answer), '{}'::jsonb) into v_answers
    from public.survey_answers where session_id = s.id;
  select definition into v_def from public.survey_templates where id = s.template_id;

  return jsonb_build_object('ok', true, 'client_name', s.client_name,
    'business_name', s.business_name, 'status', s.status, 'submitted_at', s.submitted_at,
    'answers', v_answers, 'template', coalesce(v_def, '[]'::jsonb));
end $$;

create or replace function public.survey_save(_token text, _question_id text, _answer text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare s record;
begin
  select * into s from public.survey_sessions where token = _token;
  if s is null then return jsonb_build_object('ok', false, 'error', 'Enlace no valido'); end if;
  if s.status = 'cerrada' then return jsonb_build_object('ok', false, 'error', 'Este formulario esta cerrado'); end if;
  if length(coalesce(_answer, '')) > 4000 then
    return jsonb_build_object('ok', false, 'error', 'La respuesta es demasiado larga');
  end if;
  if length(coalesce(_question_id, '')) > 12 then
    return jsonb_build_object('ok', false, 'error', 'Pregunta no valida');
  end if;

  insert into public.survey_answers (session_id, question_id, answer)
  values (s.id, _question_id, coalesce(_answer, ''))
  on conflict (session_id, question_id) do update set answer = excluded.answer, updated_at = now();

  update public.survey_sessions set last_activity_at = now() where id = s.id;
  return jsonb_build_object('ok', true, 'saved_at', now());
end $$;

create or replace function public.survey_submit(_token text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare s record; v_count int;
begin
  select * into s from public.survey_sessions where token = _token;
  if s is null then return jsonb_build_object('ok', false, 'error', 'Enlace no valido'); end if;

  select count(*) into v_count from public.survey_answers
   where session_id = s.id and length(trim(answer)) > 0;

  update public.survey_sessions set submitted_at = now(), last_activity_at = now() where id = s.id;

  if s.company_id is not null then
    insert into public.notifications (company_id, target_role, title, body, kind, link)
    values (s.company_id, 'admin', 'Levantamiento enviado · ' || s.client_name,
            v_count || ' preguntas respondidas.', 'success', '/levantamiento');
  end if;

  return jsonb_build_object('ok', true, 'answered', v_count);
end $$;

create or replace function public.intake_get(_token text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s record; v_rows jsonb;
begin
  select * into s from public.survey_sessions where token = _token;
  if s is null then return jsonb_build_object('ok', false, 'error', 'Enlace no valido'); end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'position', position, 'data', data)
                            order by kind, position), '[]'::jsonb)
    into v_rows from public.intake_rows where session_id = s.id;

  return jsonb_build_object('ok', true, 'client_name', s.client_name,
    'business_name', s.business_name, 'status', s.status, 'rows', v_rows);
end $$;

create or replace function public.intake_save_row(_token text, _kind text, _row_id uuid,
  _data jsonb, _position integer default 0)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare s record; v_id uuid; v_count int;
begin
  select * into s from public.survey_sessions where token = _token;
  if s is null then return jsonb_build_object('ok', false, 'error', 'Enlace no valido'); end if;
  if s.status = 'cerrada' then return jsonb_build_object('ok', false, 'error', 'Formulario cerrado'); end if;
  if _kind not in ('productos','rendimientos','clientes','proveedores','costos') then
    return jsonb_build_object('ok', false, 'error', 'Seccion no valida');
  end if;
  if length(_data::text) > 8000 then
    return jsonb_build_object('ok', false, 'error', 'Fila demasiado larga');
  end if;

  if _row_id is not null then
    update public.intake_rows set data = _data, position = _position
     where id = _row_id and session_id = s.id returning id into v_id;
  end if;

  if v_id is null then
    select count(*) into v_count from public.intake_rows where session_id = s.id and kind = _kind;
    if v_count >= 500 then return jsonb_build_object('ok', false, 'error', 'Demasiadas filas'); end if;
    insert into public.intake_rows (session_id, kind, position, data)
    values (s.id, _kind, _position, _data) returning id into v_id;
  end if;

  update public.survey_sessions set last_activity_at = now() where id = s.id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.intake_delete_row(_token text, _row_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare s record;
begin
  select * into s from public.survey_sessions where token = _token;
  if s is null then return jsonb_build_object('ok', false, 'error', 'Enlace no valido'); end if;
  if s.status = 'cerrada' then return jsonb_build_object('ok', false, 'error', 'Formulario cerrado'); end if;
  delete from public.intake_rows where id = _row_id and session_id = s.id;
  return jsonb_build_object('ok', true);
end $$;

-- Concesion deliberada a anon: el cliente no tiene cuenta.
do $$
declare f text;
begin
  foreach f in array array['survey_get(text)','survey_save(text,text,text)','survey_submit(text)',
    'intake_get(text)','intake_save_row(text,text,uuid,jsonb,integer)','intake_delete_row(text,uuid)'] loop
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;

comment on function public.survey_get(text) is 'Acceso por token, sin sesion. El token es la credencial.';