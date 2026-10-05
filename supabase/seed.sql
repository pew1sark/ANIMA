-- =====================================================================
-- seed.sql · Datos FICTICIOS para staging y desarrollo local
--
-- Nada de aquí es real: personas, empresas, teléfonos y montos son
-- inventados. Nunca cargar en producción.
--
-- Se aplica después de las migraciones, sobre una base nueva:
--   supabase db reset                      (local, lo aplica solo)
--   psql "$STAGING_DB_URL" -f supabase/seed.sql   (staging, una vez)
--
-- Cuentas (contraseña de todas: anima-staging — solo existe en staging):
--   admin@anima.test     Super Admin + Propietario de las dos organizaciones
--   andres@anima.test    Administrador de «Inmobiliaria Demo»
--   vendedor@anima.test  Empleado de «Comercial Demo»
--
-- Es idempotente: se puede correr dos veces sin duplicar.
-- =====================================================================

-- ------------------------------------------------------------ cuentas
-- origen=company: un trabajador de empresa no nace como Alma (0078).
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at)
values
  ('5eed0000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'admin@anima.test',
   extensions.crypt('anima-staging', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"name":"Admin Staging","origen":"company"}', now(), now()),
  ('5eed0000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'andres@anima.test',
   extensions.crypt('anima-staging', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"name":"Andrés Prueba","origen":"company"}', now(), now()),
  ('5eed0000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'vendedor@anima.test',
   extensions.crypt('anima-staging', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"name":"Vendedor Prueba","origen":"company"}', now(), now())
on conflict (id) do nothing;

-- Supabase Auth necesita la identidad para entrar con correo.
insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at)
select gen_random_uuid(), u.id, 'email', u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email), now(), now()
  from auth.users u
 where u.email like '%@anima.test'
   and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email');

insert into public.platform_admins (user_id)
values ('5eed0000-0000-4000-8000-000000000001')
on conflict do nothing;

-- ------------------------------------------------------- organizaciones
insert into public.companies (id, name, slug, country, currency, timezone, product_line_id, created_by)
select v.id, v.name, v.slug, 'CL', 'CLP', 'America/Santiago', pl.id, '5eed0000-0000-4000-8000-000000000001'
  from (values
    ('5eed0000-0000-4000-8000-0000000000c1'::uuid, 'Comercial Demo',    'comercial-demo'),
    ('5eed0000-0000-4000-8000-0000000000c2'::uuid, 'Inmobiliaria Demo', 'inmobiliaria-demo')
  ) as v(id, name, slug)
  join public.product_lines pl on pl.slug = 'company'
on conflict (id) do nothing;

-- El plan manda (0077): la suscripción enciende los módulos.
insert into public.subscriptions (company_id, plan_id, status)
select v.company_id, p.id, 'activa'
  from (values
    ('5eed0000-0000-4000-8000-0000000000c1'::uuid, 'business'),
    ('5eed0000-0000-4000-8000-0000000000c2'::uuid, 'enterprise')
  ) as v(company_id, plan)
  join public.plans p on p.slug = v.plan
 where not exists (select 1 from public.subscriptions s where s.company_id = v.company_id);

insert into public.company_members (company_id, user_id, role_id, status)
select v.company_id, v.user_id, r.id, 'active'
  from (values
    ('5eed0000-0000-4000-8000-0000000000c1'::uuid, '5eed0000-0000-4000-8000-000000000001'::uuid, 'owner'),
    ('5eed0000-0000-4000-8000-0000000000c2'::uuid, '5eed0000-0000-4000-8000-000000000001'::uuid, 'owner'),
    ('5eed0000-0000-4000-8000-0000000000c2'::uuid, '5eed0000-0000-4000-8000-000000000002'::uuid, 'admin'),
    ('5eed0000-0000-4000-8000-0000000000c1'::uuid, '5eed0000-0000-4000-8000-000000000003'::uuid, 'employee')
  ) as v(company_id, user_id, role)
  join public.roles r on r.slug = v.role
on conflict do nothing;

-- ------------------------------------------------- Comercial Demo: ventas
insert into public.customers (id, company_id, name, rut, phone, email, comuna, region)
values
  ('5eed0000-0000-4000-8000-00000000a001', '5eed0000-0000-4000-8000-0000000000c1', 'Restorán El Puerto Ficticio', '11.111.111-1', '+56 9 0000 0001', 'compras@puerto.test', 'Valparaíso', 'Valparaíso'),
  ('5eed0000-0000-4000-8000-00000000a002', '5eed0000-0000-4000-8000-0000000000c1', 'Hotel Demo Andes',            '22.222.222-2', '+56 9 0000 0002', 'cocina@andes.test',  'Santiago',   'Metropolitana'),
  ('5eed0000-0000-4000-8000-00000000a003', '5eed0000-0000-4000-8000-0000000000c1', 'Cocinería La Prueba',         '33.333.333-3', '+56 9 0000 0003', null,                 'Viña del Mar','Valparaíso')
on conflict (id) do nothing;

insert into public.products (id, company_id, sku, name, base_unit, sale_price, last_cost, min_stock)
values
  ('5eed0000-0000-4000-8000-00000000b001', '5eed0000-0000-4000-8000-0000000000c1', 'DEMO-001', 'Producto demo A (kg)', 'kg', 8900, 5200, 20),
  ('5eed0000-0000-4000-8000-00000000b002', '5eed0000-0000-4000-8000-0000000000c1', 'DEMO-002', 'Producto demo B (kg)', 'kg', 12500, 7800, 10),
  ('5eed0000-0000-4000-8000-00000000b003', '5eed0000-0000-4000-8000-0000000000c1', 'DEMO-003', 'Producto demo C (unidad)', 'unidad', 3500, 1900, 50)
on conflict (id) do nothing;

insert into public.orders (id, company_id, customer_id, status, order_date, delivery_date)
values
  ('5eed0000-0000-4000-8000-00000000d001', '5eed0000-0000-4000-8000-0000000000c1', '5eed0000-0000-4000-8000-00000000a001', 'nuevo', current_date - 2, current_date),
  ('5eed0000-0000-4000-8000-00000000d002', '5eed0000-0000-4000-8000-0000000000c1', '5eed0000-0000-4000-8000-00000000a002', 'nuevo', current_date - 1, current_date + 1)
on conflict (id) do nothing;

insert into public.order_items (id, company_id, order_id, product_id, quantity_ordered, unit, unit_price)
values
  ('5eed0000-0000-4000-8000-00000000e001', '5eed0000-0000-4000-8000-0000000000c1', '5eed0000-0000-4000-8000-00000000d001', '5eed0000-0000-4000-8000-00000000b001', 12, 'kg', 8900),
  ('5eed0000-0000-4000-8000-00000000e002', '5eed0000-0000-4000-8000-0000000000c1', '5eed0000-0000-4000-8000-00000000d001', '5eed0000-0000-4000-8000-00000000b003', 30, 'unidad', 3500),
  ('5eed0000-0000-4000-8000-00000000e003', '5eed0000-0000-4000-8000-0000000000c1', '5eed0000-0000-4000-8000-00000000d002', '5eed0000-0000-4000-8000-00000000b002',  8, 'kg', 12500)
on conflict (id) do nothing;

-- ------------------------------------ Inmobiliaria Demo: Real Estate y Brokerage
insert into public.rei_properties (id, company_id, owner_name, contact, entry_date, city, neighborhood,
                                   property_type, area_m2, list_price, commercial_status, channel)
values
  ('5eed0000-0000-4000-8000-00000000f001', '5eed0000-0000-4000-8000-0000000000c2', 'Propietaria Ficticia Uno', '+57 300 000 0001', current_date - 40, 'Medellín', 'Laureles',  'Apartamento',  78, 420000000, 'disponible', 'referido'),
  ('5eed0000-0000-4000-8000-00000000f002', '5eed0000-0000-4000-8000-0000000000c2', 'Propietario Ficticio Dos',  '+57 300 000 0002', current_date - 25, 'Medellín', 'Envigado',  'Casa',        140, 780000000, 'disponible', 'portal'),
  ('5eed0000-0000-4000-8000-00000000f003', '5eed0000-0000-4000-8000-0000000000c2', 'Propietaria Ficticia Uno', '+57 300 000 0001', current_date - 10, 'Bello',    'Centro',    'Apartamento',  56, 230000000, 'disponible', 'referido')
on conflict (id) do nothing;

insert into public.rei_buyers (id, company_id, name, contact, registered_at, city, wanted_type, budget, payment_terms)
values
  ('5eed0000-0000-4000-8000-0000000f0b01', '5eed0000-0000-4000-8000-0000000000c2', 'Comprador Ficticio A', '+57 300 000 0101', current_date - 15, 'Medellín', 'Apartamento', 450000000, 'crédito'),
  ('5eed0000-0000-4000-8000-0000000f0b02', '5eed0000-0000-4000-8000-0000000000c2', 'Compradora Ficticia B', '+57 300 000 0102', current_date - 5,  'Bello',    'Apartamento', 250000000, 'contado')
on conflict (id) do nothing;

insert into public.rei_leads (id, company_id, name, contact, operation, source, city, budget, stage, first_contact_at)
values
  ('5eed0000-0000-4000-8000-0000000f0c01', '5eed0000-0000-4000-8000-0000000000c2', 'Interesado Ficticio 1', '+57 300 000 0201', 'compra', 'meta',     'Medellín', 400000000, 'nuevo',      now() - interval '3 days'),
  ('5eed0000-0000-4000-8000-0000000f0c02', '5eed0000-0000-4000-8000-0000000000c2', 'Interesada Ficticia 2', '+57 300 000 0202', 'venta',  'referido', 'Envigado', null,      'contactado', now() - interval '6 days')
on conflict (id) do nothing;
