-- ===========================================================
-- 0126 · Los compradores y los propietarios son clientes
-- -----------------------------------------------------------
-- Real Estate Intelligence nació con su propio CRM —`rei_buyers`
-- para la demanda, `rei_properties.owner_name` para la oferta— y eso
-- está bien: son fichas de un negocio inmobiliario, con presupuesto,
-- subsidio y estado del proceso, y no cabían en la ficha de cliente
-- genérica sin deformar una de las dos.
--
-- Pero la persona es la misma. Quien registra un apartamento para
-- vender y quien pregunta por uno para comprar son clientes de la
-- firma, y el módulo CRM de la plataforma está mirando una tabla
-- vacía mientras al lado hay cuatrocientas fichas con nombre y
-- teléfono.
--
-- Esta migración no copia: ENLAZA. Cada comprador y cada propietario
-- apunta a su ficha en `customers`, y la ficha se crea una sola vez
-- por persona aunque aparezca en quince filas.
--
-- Tres decisiones que conviene dejar escritas:
--
--   1 · QUÉ IDENTIFICA A UNA PERSONA. El teléfono, no el nombre. En
--       esta base 222 inmuebles tienen 105 propietarios: el mismo
--       dueño lista varias propiedades y escribe su nombre distinto
--       cada vez. Al revés también pasa —dos personas se llaman
--       igual—, así que el nombre solo decide cuando no hay teléfono.
--
--   2 · DOS TELÉFONOS EN UNA CASILLA. Hay fichas con
--       «3202296027-3108722671». Veinte dígitos son dos móviles
--       escritos juntos, y manda el primero. No se intenta arreglar
--       los de nueve u once dígitos: son errores de digitación y
--       adivinar qué dígito sobra sería inventar un teléfono.
--
--   3 · NO PISA NADA. Si la ficha de cliente ya existe, se enlaza y
--       se rellenan únicamente los campos que estén en blanco. Lo que
--       alguien escribió a mano en el CRM gana siempre.
--
-- La función es idempotente: correrla dos veces no crea un cliente de
-- más. Lo que ya está enlazado no se vuelve a mirar.
-- ===========================================================

-- ---------- EL ENLACE ----------
-- `on delete set null` y no `cascade`: borrar una ficha de cliente en
-- el CRM no puede llevarse por delante al comprador con su
-- presupuesto y su proceso de crédito.
alter table public.rei_buyers
  add column if not exists customer_id uuid references public.customers(id) on delete set null;

alter table public.rei_properties
  add column if not exists owner_customer_id uuid references public.customers(id) on delete set null;

create index if not exists rei_buyers_customer
  on public.rei_buyers(customer_id) where customer_id is not null;
create index if not exists rei_properties_customer
  on public.rei_properties(owner_customer_id) where owner_customer_id is not null;

comment on column public.rei_buyers.customer_id is
  'La ficha de este comprador en el CRM de la empresa. La llena rei_sincronizar_crm().';
comment on column public.rei_properties.owner_customer_id is
  'La ficha del propietario en el CRM. Varios inmuebles del mismo dueño apuntan a la misma.';

-- ---------- QUÉ IDENTIFICA A UNA PERSONA ----------
create or replace function public.rei_clave_persona(p_nombre text, p_contacto text)
returns text language sql immutable as $$
  with d as (select regexp_replace(coalesce(p_contacto, ''), '[^0-9]', '', 'g') as t)
  select coalesce(
    -- Veinte dígitos son dos teléfonos escritos juntos: manda el primero.
    nullif(case when length(d.t) = 20 then left(d.t, 10) else d.t end, ''),
    -- Sin teléfono, el nombre normalizado. Peor llave, pero es la que hay.
    nullif(lower(btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'))), '')
  )
  from d;
$$;
comment on function public.rei_clave_persona(text, text) is
  'Con qué se decide que dos filas son la misma persona: el teléfono si lo hay, el nombre si no.';
revoke execute on function public.rei_clave_persona(text, text) from public, anon;
grant  execute on function public.rei_clave_persona(text, text) to authenticated;

-- La llave es inmutable, así que se puede indexar. Sin esto, buscar
-- si una persona ya está en el CRM recorre la tabla entera por cada
-- una de las cuatrocientas filas de origen.
create index if not exists customers_clave_persona
  on public.customers (company_id, public.rei_clave_persona(name, phone));

-- ---------- LA SINCRONIZACIÓN ----------
-- Nivel 60 y no 40. Anotar un comprador es trabajo del día y por eso
-- escribe a 40; dar de alta cuatrocientas fichas en el CRM de la
-- empresa es una decisión administrativa, y se parece más a encender
-- un módulo que a atender una llamada.
--
-- El orden importa y no es casual: primero se crean las fichas de la
-- demanda, después las del inventario. Cuando llega el segundo paso,
-- las fichas del primero ya existen —misma transacción, sentencias en
-- orden— así que quien vende un inmueble y además busca otro queda
-- como UN cliente con las dos puntas enlazadas, no como dos.
create or replace function public.rei_sincronizar_crm(p_company uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_nuevos_demanda int := 0; v_nuevos_inventario int := 0;
  v_enlaza_compradores int := 0; v_enlaza_inmuebles int := 0;
  v_sin_llave int := 0;
begin
  if not public.has_company_level(p_company, 60) then
    raise exception 'No tienes permiso para sincronizar el CRM de esta empresa';
  end if;

  -- ---------- LA DEMANDA ----------
  -- Una ficha por persona, no por registro: `distinct on` se queda
  -- con la fila más completa de cada una y descarta las repetidas.
  insert into public.customers (company_id, name, customer_type, phone, comuna, status, notes)
  select p_company,
         -- La planilla de origen ya normalizaba ciudad y tipo con PROPER();
         -- los nombres no, y en el CRM se leen. Se aplica la misma regla.
         initcap(p.nombre), 'particular'::customer_type,
         nullif(p.telefono, ''), p.ciudad, 'activo'::entity_status,
         'Ficha creada desde la demanda de Real Estate Intelligence.'
    from (
      select distinct on (public.rei_clave_persona(b.name, b.contact))
             public.rei_clave_persona(b.name, b.contact) as clave,
             btrim(b.name) as nombre, btrim(b.contact) as telefono, b.city as ciudad
        from public.rei_buyers b
       where b.company_id = p_company and b.deleted_at is null and b.customer_id is null
         and public.rei_clave_persona(b.name, b.contact) is not null
         and btrim(coalesce(b.name, '')) <> ''
       order by public.rei_clave_persona(b.name, b.contact),
                (b.city is not null) desc, (b.budget is not null) desc, b.created_at
    ) p
   where not exists (
     select 1 from public.customers c
      where c.company_id = p_company
        and public.rei_clave_persona(c.name, c.phone) = p.clave);
  get diagnostics v_nuevos_demanda = row_count;

  update public.rei_buyers b
     set customer_id = c.id
    from public.customers c
   where b.company_id = p_company and b.deleted_at is null and b.customer_id is null
     and c.company_id = p_company
     and public.rei_clave_persona(c.name, c.phone)
       = public.rei_clave_persona(b.name, b.contact);
  get diagnostics v_enlaza_compradores = row_count;

  -- ---------- LA OFERTA ----------
  insert into public.customers (company_id, name, customer_type, phone, comuna, status, notes)
  select p_company,
         initcap(p.nombre), 'particular'::customer_type,
         nullif(p.telefono, ''), p.ciudad, 'activo'::entity_status,
         'Ficha creada desde el inventario de Real Estate Intelligence.'
    from (
      select distinct on (public.rei_clave_persona(r.owner_name, r.contact))
             public.rei_clave_persona(r.owner_name, r.contact) as clave,
             btrim(r.owner_name) as nombre, btrim(r.contact) as telefono, r.city as ciudad
        from public.rei_properties r
       where r.company_id = p_company and r.deleted_at is null and r.owner_customer_id is null
         and public.rei_clave_persona(r.owner_name, r.contact) is not null
         and btrim(coalesce(r.owner_name, '')) <> ''
       order by public.rei_clave_persona(r.owner_name, r.contact),
                (r.city is not null) desc, r.created_at
    ) p
   where not exists (
     select 1 from public.customers c
      where c.company_id = p_company
        and public.rei_clave_persona(c.name, c.phone) = p.clave);
  get diagnostics v_nuevos_inventario = row_count;

  update public.rei_properties r
     set owner_customer_id = c.id
    from public.customers c
   where r.company_id = p_company and r.deleted_at is null and r.owner_customer_id is null
     and c.company_id = p_company
     and public.rei_clave_persona(c.name, c.phone)
       = public.rei_clave_persona(r.owner_name, r.contact);
  get diagnostics v_enlaza_inmuebles = row_count;

  -- ---------- RELLENAR HUECOS, NUNCA PISAR ----------
  -- Solo lo que esté en blanco. Si alguien corrigió un teléfono a
  -- mano, esa corrección es mejor que lo que dice la planilla.
  update public.customers c
     set phone  = coalesce(c.phone,  nullif(btrim(b.contact), '')),
         comuna = coalesce(c.comuna, b.city)
    from public.rei_buyers b
   where b.customer_id = c.id and c.company_id = p_company
     and (c.phone is null or c.comuna is null);

  update public.customers c
     set phone  = coalesce(c.phone,  nullif(btrim(r.contact), '')),
         comuna = coalesce(c.comuna, r.city)
    from public.rei_properties r
   where r.owner_customer_id = c.id and c.company_id = p_company
     and (c.phone is null or c.comuna is null);

  -- Quien no tiene nombre no puede ser una ficha de cliente: «Sin
  -- nombre» repetido cuatro veces no es información, y si además le
  -- falta el teléfono ni siquiera se distingue del siguiente.
  select count(*) into v_sin_llave
    from (select 1 from public.rei_buyers
           where company_id = p_company and deleted_at is null and customer_id is null
          union all
          select 1 from public.rei_properties
           where company_id = p_company and deleted_at is null and owner_customer_id is null) t;

  return jsonb_build_object(
    'clientes_nuevos',       v_nuevos_demanda + v_nuevos_inventario,
    'desde_la_demanda',      v_nuevos_demanda,
    'desde_el_inventario',   v_nuevos_inventario,
    'compradores_enlazados', v_enlaza_compradores,
    'inmuebles_enlazados',   v_enlaza_inmuebles,
    'sin_enlazar',           v_sin_llave,
    'total_clientes',        (select count(*) from public.customers where company_id = p_company));
end $$;
comment on function public.rei_sincronizar_crm(uuid) is
  'Da de alta en el CRM a los compradores y propietarios del módulo inmobiliario, una ficha por persona, y deja el enlace puesto. Idempotente.';
revoke execute on function public.rei_sincronizar_crm(uuid) from public, anon;
grant  execute on function public.rei_sincronizar_crm(uuid) to authenticated;
