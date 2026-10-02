-- =====================================================================
-- 0142 · Cada cliente potencial llega con nombre, WhatsApp y Vínculo
--
-- El problema (2 oct 2026): el formulario de Meta está en español y manda
-- los campos como «nombre_completo», «número_de_teléfono» y
-- «correo_electrónico». La Edge Function solo reconocía full_name,
-- phone_number y email, así que 115 solicitudes entraron sin nombre ni
-- teléfono aunque el dato venía en `answers`.
--
-- La solución vive en la base, para que valga igual por la API, el
-- webhook o el CSV:
--   1. lead_respuesta(): busca un dato en `answers` por clave o etiqueta,
--      sin tildes ni mayúsculas, en español o inglés.
--   2. client_leads_completar (BEFORE INSERT/UPDATE): completa nombre,
--      teléfono y correo vacíos y, si hay nombre + contacto, deja a la
--      persona en Vínculos (reusa el Vínculo si ya existe por teléfono o
--      correo). Un error ahí NUNCA impide que la solicitud entre.
--   3. Se completan las solicitudes que ya estaban guardadas.
-- =====================================================================

-- Texto comparable: minúsculas, sin tildes, espacios → «_».
create or replace function public.lead_norm(t text)
returns text language sql immutable as $$
  select regexp_replace(translate(lower(coalesce(t, '')), 'áéíóúüñ', 'aeiouun'), '[\s\-]+', '_', 'g');
$$;

-- Primer valor de `answers` cuya clave o etiqueta normalizada está en `claves`.
-- Quita los prefijos del CSV de Meta («p:+569…», «l:…»).
create or replace function public.lead_respuesta(answers jsonb, claves text[])
returns text language sql immutable as $$
  select nullif(btrim(regexp_replace(a->>'value', '^[a-z]{1,3}:', '')), '')
  from jsonb_array_elements(coalesce(answers, '[]'::jsonb)) a
  where public.lead_norm(a->>'key') = any(claves) or public.lead_norm(a->>'label') = any(claves)
  limit 1;
$$;

-- Teléfono comparable (Chile por defecto): solo dígitos y con 56.
create or replace function public.tel_normal(t text)
returns text language sql immutable as $$
  select case
    when d ~ '^00' then substr(d, 3)
    when length(d) = 9 and d ~ '^9' then '56' || d
    when length(d) = 8 then '569' || d
    else d end
  from (select regexp_replace(coalesce(t, ''), '\D', '', 'g') d) x;
$$;

create or replace function public.client_leads_completar()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_tel text;
begin
  if new.full_name is null then
    new.full_name := coalesce(
      public.lead_respuesta(new.answers, array['full_name','nombre_completo','nombre_y_apellido','nombre_y_apellidos','name']),
      nullif(btrim(concat_ws(' ',
        public.lead_respuesta(new.answers, array['first_name','nombre','nombre_de_pila']),
        public.lead_respuesta(new.answers, array['last_name','apellido','apellidos']))), ''));
  end if;
  if new.phone is null then
    new.phone := public.lead_respuesta(new.answers, array['phone_number','phone','numero_de_telefono','telefono',
      'numero_de_celular','celular','whatsapp','numero_de_whatsapp','movil','numero_de_movil']);
  end if;
  if new.email is null then
    new.email := public.lead_respuesta(new.answers, array['email','correo_electronico','correo','e_mail','work_email','mail']);
  end if;

  -- A Vínculos: con nombre y algún contacto, y si no está descartada.
  if new.client_id is null and coalesce(new.status, 'nuevo') <> 'descartado'
     and new.full_name is not null and (new.phone is not null or new.email is not null) then
    begin
      v_tel := public.tel_normal(new.phone);
      select c.id into v_id from public.clients c
       where c.alma_id = new.alma_id
         and ((v_tel <> '' and public.tel_normal(c.phone) = v_tel)
           or (new.email is not null and lower(c.email) = lower(new.email)))
       order by c.created_at limit 1;
      if v_id is null then
        insert into public.clients (alma_id, name, phone, email, kind, notes)
        values (new.alma_id, new.full_name, new.phone, new.email, 'cliente',
                concat_ws(E'\n',
                  'Cliente potencial · ' || coalesce(new.campaign_name, 'anuncio de Meta'),
                  case when new.city is not null then 'Muro: ' || new.city end,
                  case when new.measures is not null then 'Medidas: ' || new.measures end,
                  case when new.idea is not null then 'Idea: ' || new.idea end))
        returning id into v_id;
      end if;
      new.client_id := v_id;
    exception when others then
      null;   -- cupo del plan u otro error: la solicitud entra igual, sin Vínculo
    end;
  end if;
  return new;
end; $$;

drop trigger if exists client_leads_completar on public.client_leads;
create trigger client_leads_completar
  before insert or update on public.client_leads
  for each row execute function public.client_leads_completar();

-- Completar lo que ya llegó (el UPDATE dispara el mismo trigger).
update public.client_leads
   set full_name = full_name
 where full_name is null or phone is null or email is null
    or (client_id is null and status <> 'descartado');

-- Vínculos creados antes sin nombre («Cliente sin nombre») toman el de su solicitud.
update public.clients c set name = l.full_name, email = coalesce(c.email, l.email), phone = coalesce(c.phone, l.phone)
  from public.client_leads l
 where l.client_id = c.id and c.name in ('Cliente sin nombre', 'Cliente potencial') and l.full_name is not null;
