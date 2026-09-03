-- ===========================================================
-- 0087 · Lo que el plan incluye, se ve
--
-- Un módulo se usa si está encendido en `company_modules` Y su plan
-- lo incluye en `plan_modules`. `crear_cliente()` enciende lo del
-- plan al dar de alta, pero nada volvía a mirar esa lista después:
-- las empresas anteriores a esa función, y cualquiera que cambie de
-- plan, quedan pagando módulos que no aparecen en su menú.
--
-- Al escribir esto, Bilagay tenía seis módulos encendidos de los
-- diez que incluye su plan Pro —sin Agenda, Taller, Procesos ni
-- Soporte— y ANIMA TSC, otros seis de diez. Nadie los apagó: nunca
-- se encendieron.
--
-- Esta migración pone tres cosas:
--   1 · una función que sincroniza encendidos con el plan,
--   2 · un disparador para que un cambio de plan los traiga solos,
--   3 · una puerta para que el administrador de la empresa encienda
--       y apague desde Configuración, sin pasar por la Consola.
--
-- Sincronizar solo ENCIENDE. Apagar es una decisión de quien usa la
-- empresa —hay quien no quiere ver Procesos aunque lo pague— y una
-- migración no está para deshacerla.
-- ===========================================================

-- 1 · Encender lo que el plan incluye ------------------------------
create or replace function public.sincronizar_modulos_del_plan(p_company uuid)
returns integer
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
  with encendidos as (
    insert into public.company_modules (company_id, module_id, enabled)
    select p_company, pm.module_id, true
      from public.subscriptions s
      join public.plan_modules pm on pm.plan_id = s.plan_id
     where s.company_id = p_company
       and s.status in ('prueba','activa','morosa')
    on conflict (company_id, module_id) do nothing
    returning 1
  )
  select count(*)::integer from encendidos;
$$;

comment on function public.sincronizar_modulos_del_plan(uuid) is
  'Enciende los módulos que el plan de la empresa incluye y aún no tiene en company_modules. Nunca apaga.';

revoke all on function public.sincronizar_modulos_del_plan(uuid) from anon, authenticated;

-- 2 · Que un cambio de plan los traiga solo ------------------------
create or replace function public.suscripcion_sincroniza_modulos()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  perform public.sincronizar_modulos_del_plan(new.company_id);
  return new;
end $$;

drop trigger if exists trg_suscripcion_sincroniza_modulos on public.subscriptions;
create trigger trg_suscripcion_sincroniza_modulos
  after insert or update of plan_id, status on public.subscriptions
  for each row execute function public.suscripcion_sincroniza_modulos();

-- 3 · La empresa decide qué usa de lo que paga ---------------------
/* Escribir en company_modules ya lo permite RLS a nivel 80; esto solo
   evita que la pantalla tenga que conocer los ids de los módulos, y
   deja el intento registrado en la auditoría. Es SECURITY INVOKER a
   propósito: quien manda sigue siendo la política de la tabla. */
create or replace function public.company_module_set(
  p_company uuid, p_modulo text, p_encendido boolean)
returns jsonb
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $$
declare v_module uuid;
begin
  select id into v_module from public.modules where slug = p_modulo and active;
  if v_module is null then
    raise exception 'No existe el módulo "%"', p_modulo;
  end if;
  if p_modulo = 'core' then
    raise exception 'El módulo Core sostiene la empresa: no se apaga';
  end if;

  insert into public.company_modules (company_id, module_id, enabled)
  values (p_company, v_module, p_encendido)
  on conflict (company_id, module_id) do update
     set enabled = excluded.enabled, updated_at = now();

  insert into public.audit_logs (company_id, user_id, action, entity, entity_id, metadata)
  values (p_company, (select auth.uid()),
          case when p_encendido then 'MODULO_ENCENDIDO' else 'MODULO_APAGADO' end,
          'company_modules', p_modulo, jsonb_build_object('modulo', p_modulo));

  return (select jsonb_agg(jsonb_build_object(
            'slug', x.modulo, 'encendido', x.encendido,
            'en_el_plan', x.en_el_plan, 'disponible', x.disponible))
          from public.company_plan_state(p_company) x);
end $$;

comment on function public.company_module_set(uuid, text, boolean) is
  'Enciende o apaga un módulo de la empresa. RLS (nivel 80) decide quién puede.';

revoke all on function public.company_module_set(uuid, text, boolean) from anon;
grant execute on function public.company_module_set(uuid, text, boolean) to authenticated;

-- 4 · Ponerse al día ----------------------------------------------
select public.sincronizar_modulos_del_plan(c.id) from public.companies c;

-- 5 · Los que quedaron apagados de la siembra ----------------------
/* Las filas apagadas de company_modules venían todas del mismo insert de
   siembra del 22-08-2026, no de que alguien las apagara: Bilagay tenía en
   `false` Agenda, Taller, Procesos y Soporte, los cuatro incluidos en su plan
   Pro. Encenderlas es corregir la siembra, no decidir por el cliente; de aquí
   en adelante quien apague algo lo hace desde Configuración y esto no lo
   vuelve a tocar (arriba solo se insertan las que faltan). */
update public.company_modules cm
   set enabled = true, updated_at = now()
 where not cm.enabled
   and exists (select 1 from public.subscriptions s
                join public.plan_modules pm on pm.plan_id = s.plan_id
                                           and pm.module_id = cm.module_id
               where s.company_id = cm.company_id
                 and s.status in ('prueba','activa','morosa'));
