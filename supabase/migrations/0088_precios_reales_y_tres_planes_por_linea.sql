begin;

-- ---------------------------------------------------------------------------
-- Los precios dejan de ser cero y cada línea queda en tres planes
-- ---------------------------------------------------------------------------
-- Hasta hoy el catálogo no coincidía con nada: STUDIO tenía tres planes a $0
-- —el precio se conversaba— y COMPANY tenía cuatro (starter, pro, business,
-- enterprise) mientras el sitio publicaba otra cosa. Con precio publicado en
-- planes.html, la base tiene que decir exactamente lo mismo: una cifra distinta
-- en la consola y en la portada es peor que ninguna cifra.
--
-- STUDIO   Starter  $9.990 · Pro $29.990 · Max $49.990
-- COMPANY  Básico  $29.990 · Pro $49.990 · Enterprise (se cotiza)
--
-- No se crea ni se borra ninguna fila: se renombran y se les pone precio. Eso
-- importa, porque hay suscripciones vivas colgando de estos planes y borrar el
-- plan de un cliente es apagarle los módulos.

-- ---------------------------------------------------------- STUDIO
update public.plans set name = 'Starter', price_amount =  9990, sort = 10 where slug = 'studio_solo';
update public.plans set name = 'Pro',     price_amount = 29990, sort = 20 where slug = 'studio_taller';
update public.plans set name = 'Max',     price_amount = 49990, sort = 30 where slug = 'studio_clan';

-- ---------------------------------------------------------- COMPANY
-- `business` pasa a llamarse Pro: es el que ya tiene la operación completa
-- (inventario, reparto y procesos), que es lo que ahora se vende como Pro.
-- Pescadería Bilagay está suscrita justo a esa fila y no se mueve de sitio:
-- cambia el nombre y el precio, no lo que ve al entrar.
update public.plans set name = 'Básico', price_amount = 29990, sort = 10 where slug = 'starter';
update public.plans set name = 'Pro',    price_amount = 49990, sort = 20 where slug = 'business';
update public.plans set name = 'Enterprise', price_amount = 0,  sort = 30 where slug = 'enterprise';

-- El antiguo `pro` de COMPANY (8 personas, sin operaciones) ya no se vende:
-- queda fuera del catálogo, pero la fila sobrevive para que ninguna suscripción
-- histórica apunte al vacío.
update public.plans
   set name = 'Pro (heredado)', active = false, sort = 90
 where slug = 'pro';

-- La única suscripción que colgaba de él es la organización interna de ANIMA.
-- Se mueve al Pro nuevo, que incluye todo lo que tenía y además la operación.
update public.subscriptions s
   set plan_id = (select id from public.plans where slug = 'business')
  from public.plans p
 where p.id = s.plan_id and p.slug = 'pro';

commit;
