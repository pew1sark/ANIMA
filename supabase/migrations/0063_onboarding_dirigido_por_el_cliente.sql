-- 0063 · EL CLIENTE CONFIGURA SU PROPIA PLATAFORMA
-- El levantamiento deja de ser un cuestionario y pasa a ser el instalador.
-- El motor de reglas ya encendia modulos y escribia ajustes; ahora tambien
-- puede CREAR CAMPOS PERSONALIZADOS y ENCENDER FEATURES.
--
-- Y import_intake convierte las listas que carga el cliente (sus productos,
-- sus clientes, sus proveedores) en datos reales. Lo importante: las columnas
-- que el cliente traiga y no existan en el modelo NO se pierden — se guardan
-- como campos personalizados, y ademas quedan DEFINIDOS para su formulario.
-- Asi la plataforma aprende la forma del negocio desde lo que el cliente sube.

create or replace function public.survey_apply(p_session uuid)
returns table(regla text, efecto text, resultado text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_company uuid; v_rules jsonb; r jsonb; v_ans text; v_ok boolean;
        v_mod uuid; v_feat uuid; e jsonb;
begin
  select s.company_id, t.rules into v_company, v_rules
  from public.survey_sessions s
  left join public.survey_templates t on t.id = s.template_id
  where s.id = p_session;

  if v_company is null then
    regla:='—'; efecto:='—'; resultado:='La sesion no esta asociada a ninguna empresa'; return next; return;
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
    e := r->'effect';

    if not v_ok then
      efecto := coalesce(e->>'module', e->>'setting', e->>'feature',
                         e->'custom_field'->>'key', '—');
      resultado := 'no cumple'; return next;

    elsif e ? 'module' then
      select id into v_mod from public.modules where slug = e->>'module';
      if v_mod is not null then
        insert into public.company_modules (company_id, module_id, enabled)
        values (v_company, v_mod, coalesce((e->>'enable')::boolean, true))
        on conflict (company_id, module_id) do update set enabled = excluded.enabled, updated_at = now();
        efecto := 'modulo '||(e->>'module'); resultado := 'aplicada'; return next;
      end if;

    elsif e ? 'setting' then
      update public.companies
         set settings = jsonb_set(settings, array[e->>'setting'], to_jsonb(coalesce(v_ans,'')), true)
       where id = v_company;
      efecto := 'ajuste '||(e->>'setting'); resultado := 'aplicada'; return next;

    elsif e ? 'feature' then
      select id into v_feat from public.features where slug = e->>'feature';
      if v_feat is not null then
        insert into public.company_features (company_id, feature_id, enabled)
        values (v_company, v_feat, true)
        on conflict (company_id, feature_id) do update set enabled = true;
        efecto := 'feature '||(e->>'feature'); resultado := 'aplicada'; return next;
      else
        efecto := 'feature '||(e->>'feature'); resultado := 'no existe'; return next;
      end if;

    elsif e ? 'custom_field' then
      insert into public.custom_fields (company_id, entity, key, label, field_type, options, help, source)
      values (v_company,
              e->'custom_field'->>'entity',
              e->'custom_field'->>'key',
              coalesce(e->'custom_field'->>'label', e->'custom_field'->>'key'),
              coalesce((e->'custom_field'->>'type')::public.custom_field_type, 'texto'),
              coalesce(e->'custom_field'->'options', '[]'::jsonb),
              nullif(v_ans,''),
              'levantamiento')
      on conflict (company_id, entity, key) do update set active = true;
      efecto := 'campo '||(e->'custom_field'->>'entity')||'.'||(e->'custom_field'->>'key');
      resultado := 'aplicada'; return next;

    else
      efecto := '—'; resultado := 'efecto no reconocido'; return next;
    end if;
  end loop;

  update public.survey_sessions set applied_at = now() where id = p_session;
end $$;
revoke execute on function public.survey_apply(uuid) from public, anon;
grant  execute on function public.survey_apply(uuid) to authenticated;

-- ---------- Las listas del cliente se vuelven datos reales ----------
create or replace function public.import_intake(_session_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_company uuid; r record; d jsonb; k text; v_extra jsonb;
        v_prod int := 0; v_cli int := 0; v_prov int := 0; v_campos int := 0;
        v_conocidas text[];
begin
  select company_id into v_company from public.survey_sessions where id = _session_id;
  perform public.assert_company(v_company, 80);

  for r in select * from public.intake_rows
           where session_id = _session_id and imported_at is null
           order by kind, position loop
    d := r.data;
    v_extra := '{}'::jsonb;

    if r.kind = 'productos' then
      v_conocidas := array['nombre','unidad','precio_venta','costo_compra','stock_minimo',
                           'dias_duracion','presentacion','observaciones','proveedor_habitual','sku'];
      -- Todo lo que el cliente trajo y no reconocemos se guarda igual
      for k in select jsonb_object_keys(d) loop
        if not (k = any(v_conocidas)) and coalesce(d->>k,'') <> '' then
          v_extra := v_extra || jsonb_build_object(k, d->k);
          insert into public.custom_fields (company_id, entity, key, label, field_type, source)
          values (v_company, 'products', k, initcap(replace(k,'_',' ')), 'texto', 'levantamiento')
          on conflict (company_id, entity, key) do nothing;
          if found then v_campos := v_campos + 1; end if;
        end if;
      end loop;

      insert into public.products (company_id, name, sku, presentation, base_unit,
             sale_price, last_cost, avg_cost, min_stock, shelf_life_days, notes, custom)
      values (v_company, coalesce(nullif(trim(d->>'nombre'),''),'Sin nombre'),
              nullif(d->>'sku',''), nullif(d->>'presentacion',''),
              coalesce(nullif(d->>'unidad','')::public.unit_measure,'kg'),
              coalesce(nullif(d->>'precio_venta','')::numeric, 0),
              coalesce(nullif(d->>'costo_compra','')::numeric, 0),
              coalesce(nullif(d->>'costo_compra','')::numeric, 0),
              coalesce(nullif(d->>'stock_minimo','')::numeric, 0),
              nullif(d->>'dias_duracion','')::int,
              nullif(d->>'observaciones',''), v_extra)
      on conflict (company_id, sku) do nothing;
      v_prod := v_prod + 1;

    elsif r.kind = 'clientes' then
      insert into public.customers (company_id, name, rut, phone, email, address, comuna, notes)
      values (v_company, coalesce(nullif(trim(d->>'nombre'),''),'Sin nombre'),
              nullif(d->>'rut',''), nullif(d->>'telefono',''), nullif(d->>'email',''),
              nullif(d->>'direccion',''), nullif(d->>'comuna',''), nullif(d->>'observaciones',''))
      on conflict do nothing;
      v_cli := v_cli + 1;

    elsif r.kind = 'proveedores' then
      insert into public.suppliers (company_id, name, rut, phone, email, notes)
      values (v_company, coalesce(nullif(trim(d->>'nombre'),''),'Sin nombre'),
              nullif(d->>'rut',''), nullif(d->>'telefono',''), nullif(d->>'email',''),
              nullif(d->>'observaciones',''))
      on conflict do nothing;
      v_prov := v_prov + 1;
    end if;

    update public.intake_rows set imported_at = now() where id = r.id;
  end loop;

  insert into public.audit_logs (company_id, user_id, action, entity, entity_id, metadata)
  values (v_company, (select auth.uid()), 'IMPORTAR_LEVANTAMIENTO', 'survey_sessions', _session_id::text,
          jsonb_build_object('productos', v_prod, 'clientes', v_cli,
                             'proveedores', v_prov, 'campos_descubiertos', v_campos));

  return jsonb_build_object('ok', true, 'productos', v_prod, 'clientes', v_cli,
                            'proveedores', v_prov, 'campos_descubiertos', v_campos);
end $$;
revoke execute on function public.import_intake(uuid) from public, anon;
grant  execute on function public.import_intake(uuid) to authenticated;

-- ---------- Reglas nuevas en la plantilla ----------
-- Ahora el cuestionario tambien crea campos y enciende funcionalidades.
update public.survey_templates
set rules = rules || $R$[
 {"question_id":"C13","operator":"contains","value":"sernapesca",
  "effect":{"feature":"fish_reception"}},
 {"question_id":"C11","operator":"contains","value":"si",
  "effect":{"custom_field":{"entity":"inventory_lots","key":"temperatura_recepcion",
            "label":"Temperatura al recibir","type":"numero"}}},
 {"question_id":"B3","operator":"not_empty",
  "effect":{"custom_field":{"entity":"products","key":"presentacion_corte",
            "label":"Tipo de corte","type":"texto"}}},
 {"question_id":"B15","operator":"contains","value":"si",
  "effect":{"custom_field":{"entity":"products","key":"codigo_interno",
            "label":"Codigo interno","type":"texto"}}}
]$R$::jsonb
where slug = 'comercializadora-alimentos';