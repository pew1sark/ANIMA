-- 0070 · ANIMA pasa a un plan de su propia linea.
--
-- Quedaba una incoherencia de la 0067: ANIMA estaba en la linea STUDIO pero con
-- el plan `enterprise`, que es de COMPANY. Venia de antes, cuando STUDIO no
-- tenia ningun plan y habia que colgarla de alguno.
--
-- Pasa a `studio_clan`, el tramo mas alto de Studio. Comprobado antes de
-- aplicarlo: los seis modulos que ANIMA tiene encendidos —agenda, commerce,
-- core, creator, crm, finance— estan todos incluidos en studio_clan, asi que no
-- pierde nada; ademas suma `support` como disponible.

update public.subscriptions s
   set plan_id      = (select id from public.plans where slug = 'studio_clan'),
       price_amount = (select price_amount from public.plans where slug = 'studio_clan')
 from public.companies c
where c.id = s.company_id
  and c.slug = 'anima'
  and s.plan_id = (select id from public.plans where slug = 'enterprise');

-- El catalogo de modulos disponibles de la empresa se realinea al plan nuevo:
-- lo que el plan ya no incluye deja de estar disponible, pero nada de lo que
-- estaba encendido se apaga (se verifico que studio_clan los cubre todos).
delete from public.company_modules cm
 using public.companies c
where c.id = cm.company_id and c.slug = 'anima'
  and not exists (
    select 1 from public.plan_modules pm
    join public.subscriptions s on s.plan_id = pm.plan_id and s.company_id = c.id
    where pm.module_id = cm.module_id)
  and not cm.enabled;
