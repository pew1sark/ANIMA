-- 0067 · ANIMA queda con DOS lineas de producto: STUDIO y COMPANY.
--
-- INDUSTRY se funde en COMPANY: era una tercera linea con un solo plan
-- (enterprise) y una sola empresa (Bilagay). El producto se cuenta en dos
-- sub-plataformas, y el esquema pasa a decir lo mismo.
--
-- Y STUDIO deja de ser una etiqueta sin producto: hasta ahora no tenia ningun
-- plan, y la empresa `anima` funcionaba con modulos encendidos a mano. Ahora
-- tiene sus tres tramos. Los precios quedan en cero a proposito: los define SARK.

-- ---------- 1 · Lo que estaba en INDUSTRY pasa a COMPANY ----------
update public.plans
   set product_line_id = (select id from public.product_lines where slug = 'company')
 where slug = 'enterprise';

update public.companies
   set product_line_id = (select id from public.product_lines where slug = 'company')
 where product_line_id = (select id from public.product_lines where slug = 'industry');

-- No se borra: se retira. Conserva el historial y la decision es reversible.
update public.product_lines set active = false where slug = 'industry';

-- ---------- 2 · Los planes de ANIMA STUDIO ----------
-- Escala pensada sobre el Taller que ya existe: proyectos, tareas, vinculos,
-- cotizador, raiz (finanzas) y agenda.
insert into public.plans (slug, name, description, product_line_id, price_amount,
                          currency, billing_cycle, max_users, trial_days, sort, active)
select v.slug, v.name, v.description,
       (select id from public.product_lines where slug = 'studio'),
       0, 'CLP', 'mensual', v.max_users, 14, v.sort, true
from (values
  ('studio_solo',   'Solo',   'Un creador trabajando por su cuenta: obra, agenda y portafolio.',        1,  10),
  ('studio_taller', 'Taller', 'Con clientes y dinero de por medio: cotizaciones, vinculos y finanzas.', 3,  20),
  ('studio_clan',   'Clan',   'Un equipo creativo con encargos y ventas.',                             10,  30)
) as v(slug, name, description, max_users, sort)
on conflict (slug) do nothing;

-- ---------- 3 · Que modulo trae cada tramo ----------
insert into public.plan_modules (plan_id, module_id)
select p.id, m.id
from public.plans p
join (values
  ('studio_solo',   'core'),    ('studio_solo',   'creator'), ('studio_solo',   'agenda'),
  ('studio_taller', 'core'),    ('studio_taller', 'creator'), ('studio_taller', 'agenda'),
  ('studio_taller', 'crm'),     ('studio_taller', 'finance'),
  ('studio_clan',   'core'),    ('studio_clan',   'creator'), ('studio_clan',   'agenda'),
  ('studio_clan',   'crm'),     ('studio_clan',   'finance'), ('studio_clan',   'commerce'),
  ('studio_clan',   'support')
) as v(plan_slug, module_slug) on v.plan_slug = p.slug
join public.modules m on m.slug = v.module_slug
on conflict do nothing;
