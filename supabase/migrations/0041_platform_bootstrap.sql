-- ===========================================================
-- 0041 · ARRANQUE DE LA PLATAFORMA
-- Perfiles para los usuarios que ya existían, Super Admin, y las
-- dos primeras empresas: ANIMA y Pescadería Bilagay (primer cliente).
-- Idempotente: se puede volver a ejecutar sin efectos.
-- ===========================================================

-- 1) Perfil para cada usuario ya registrado (el trigger solo cubre los nuevos)
insert into public.profiles (id, email, full_name)
select u.id, coalesce(u.email,''), coalesce(u.raw_user_meta_data->>'name','')
from auth.users u
on conflict (id) do nothing;

-- 2) Super Admin de la plataforma
insert into public.platform_admins (user_id, note)
select u.id, 'Propietario de la plataforma. Alta en el arranque 0041.'
from auth.users u where u.email = 'sarkgraff@gmail.com'
on conflict (user_id) do nothing;

-- 3) Empresas iniciales (el trigger on_company_created deja al creador como owner)
insert into public.companies (name, slug, status, country, currency, created_by, settings)
select 'ANIMA', 'anima', 'active', 'CL', 'CLP', u.id,
       jsonb_build_object('tipo','creator','origen','ANIMA Studio')
from auth.users u where u.email = 'sarkgraff@gmail.com'
on conflict (slug) do nothing;

insert into public.companies (name, slug, status, country, currency, created_by, settings)
select 'Pescaderia Bilagay', 'bilagay', 'active', 'CL', 'CLP', u.id,
       jsonb_build_object('tipo','commerce','origen','JLIZ BUSINESS','piloto',true)
from auth.users u where u.email = 'sarkgraff@gmail.com'
on conflict (slug) do nothing;

-- 4) Módulos encendidos por empresa
insert into public.company_modules (company_id, module_id, enabled)
select c.id, m.id, true
from public.companies c join public.modules m on true
where c.slug = 'anima' and m.slug in ('core','creator','crm','finance','agenda','commerce')
on conflict (company_id, module_id) do update set enabled = true;

insert into public.company_modules (company_id, module_id, enabled)
select c.id, m.id, true
from public.companies c join public.modules m on true
where c.slug = 'bilagay' and m.slug in ('core','commerce','crm','operations','delivery','finance')
on conflict (company_id, module_id) do update set enabled = true;

-- El resto del catálogo queda registrado y apagado, listo para encenderse
insert into public.company_modules (company_id, module_id, enabled)
select c.id, m.id, false
from public.companies c join public.modules m on true
where c.slug in ('anima','bilagay')
on conflict (company_id, module_id) do nothing;

-- 5) Huella del arranque en auditoría (acción de plataforma: company_id nulo)
insert into public.audit_logs (company_id, user_id, action, entity, metadata)
select null, u.id, 'platform.bootstrap', 'platform',
       jsonb_build_object('migracion','0041','empresas', array['anima','bilagay'])
from auth.users u where u.email = 'sarkgraff@gmail.com';
