-- 0068 · tenant_type: quien es dueno de los datos que la organizacion administra.
--
--   operator  la organizacion gestiona SU PROPIA data.
--             Es el caso de ANIMA (Studio) y de Bilagay (Company).
--   advisor   la organizacion gestiona la data de TERCEROS: un asesor contable
--             o financiero que lleva varios clientes. Habilita la capa de
--             clients -> locations -> transacciones (Fase 6).
--
-- Es un eje distinto al de product_lines. La linea dice QUE hace la
-- organizacion (crear vs operar un negocio); tenant_type dice DE QUIEN son los
-- datos. Un asesor puede estar en COMPANY y ser advisor a la vez.
--
-- Nota de diseno: el prompt maestro pedia ademas una columna `tipo`
-- (individual/negocio/empresa). No se agrega: `product_lines` ya distingue al
-- creador individual (STUDIO) de la empresa (COMPANY), y un tercer eje que se
-- solapa con ese solo abre la puerta a que se contradigan.

do $$ begin create type public.tenant_type as enum ('operator','advisor');
exception when duplicate_object then null; end $$;

alter table public.companies
  add column if not exists tenant_type public.tenant_type not null default 'operator';

comment on column public.companies.tenant_type is
  'operator: administra su propia data. advisor: administra la de terceros (Fase 6).';

-- Los asesores son pocos frente a los operadores: indice parcial.
create index if not exists companies_advisor_idx
  on public.companies(id) where tenant_type = 'advisor';

-- ---------- Funcion de apoyo ----------
-- Misma forma que el resto de las ayudas del nucleo: SECURITY DEFINER con
-- search_path fijo y sin EXECUTE para anon.
create or replace function public.is_advisor(p_company uuid default null)
returns boolean language sql stable security definer set search_path = public, pg_temp as $fn$
  select exists (
    select 1 from public.companies c
     where c.id = coalesce(p_company, public.current_company())
       and c.tenant_type = 'advisor'
  );
$fn$;
revoke execute on function public.is_advisor(uuid) from public, anon;
grant  execute on function public.is_advisor(uuid) to authenticated;

-- ---------- El portal necesita saberlo para decidir que pantalla mostrar ----------
create or replace function public.mi_espacio(p_company uuid)
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $fn$
  select jsonb_build_object(
    'empresa',   (select jsonb_build_object('id',c.id,'nombre',c.name,'slug',c.slug,
                          'moneda',c.currency,'pais',c.country,'estado',c.status,
                          'linea', pl.name, 'linea_slug', pl.slug,
                          'tipo', c.tenant_type)
                  from public.companies c
                  left join public.product_lines pl on pl.id = c.product_line_id
                  where c.id = p_company),
    'plan',      (select jsonb_build_object('nombre',p.name,'estado',s.status,'precio',s.price_amount)
                  from public.subscriptions s join public.plans p on p.id = s.plan_id
                  where s.company_id = p_company limit 1),
    'modulos',   (select coalesce(jsonb_agg(jsonb_build_object(
                          'slug',x.modulo,'encendido',x.encendido,
                          'en_el_plan',x.en_el_plan,'disponible',x.disponible)),'[]'::jsonb)
                  from public.company_plan_state(p_company) x),
    'features',  (select coalesce(jsonb_agg(jsonb_build_object(
                          'slug',f.slug,'nombre',f.name,'etapa',f.stage,'descripcion',f.description)),'[]'::jsonb)
                  from public.company_features cf join public.features f on f.id = cf.feature_id
                  where cf.company_id = p_company and cf.enabled),
    'mi_rol',    (select jsonb_build_object('nombre',r.name,'nivel',r.level,'funcional',cm.job_role)
                  from public.company_members cm join public.roles r on r.id = cm.role_id
                  where cm.company_id = p_company and cm.user_id = (select auth.uid()) limit 1)
  );
$fn$;
revoke execute on function public.mi_espacio(uuid) from public, anon;
grant  execute on function public.mi_espacio(uuid) to authenticated;
