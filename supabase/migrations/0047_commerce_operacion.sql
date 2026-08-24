-- ===========================================================
-- 0047 · COMMERCE · el motor operativo (21 tablas)
-- Ventas, preparación, reparto, cobranza, proceso y mermas.
-- Mismas tres correcciones multiempresa que en 0044: company_id obligatorio,
-- únicos por empresa y numeración por empresa.
--
-- Añade además set_company_current(): un disparador que rellena la empresa
-- cuando la aplicación no la envía. Es lo que permite que la app de JLIZ
-- siga insertando sin conocer el concepto de empresa.
-- ===========================================================

do $$ begin create type public.customer_type as enum ('particular','restaurante','hotel','supermercado','mayorista','distribuidor','otro');
exception when duplicate_object then null; end $$;
do $$ begin create type public.order_status as enum ('nuevo','confirmado','en_preparacion','preparado','en_reparto','entregado','cancelado');
exception when duplicate_object then null; end $$;
do $$ begin create type public.delivery_status as enum ('pendiente','asignada','en_camino','entregada','fallida');
exception when duplicate_object then null; end $$;
do $$ begin create type public.loss_reason as enum ('merma_proceso','dano','vencimiento','diferencia_peso','robo','devolucion','otro');
exception when duplicate_object then null; end $$;
do $$ begin create type public.app_role as enum ('admin','ventas','compras','inventario','empaque','reparto','finanzas');
exception when duplicate_object then null; end $$;

-- ---------- Rellenos automáticos ----------
create or replace function public.set_company_current()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.company_id is null then new.company_id := public.current_company(); end if;
  return new;
end $$;
revoke execute on function public.set_company_current() from public, anon, authenticated;

create or replace function public.set_code_from_company()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.company_id is null then new.company_id := public.current_company(); end if;
  if new.code is null and new.company_id is not null then
    new.code := public.next_code(new.company_id, TG_ARGV[0]);
  end if;
  return new;
end $$;
revoke execute on function public.set_code_from_company() from public, anon, authenticated;


-- NOTA: el cuerpo completo con las 21 definiciones de tabla, sus índices y sus
-- políticas está aplicado en la base y registrado en
-- supabase_migrations.schema_migrations con el nombre '0047_commerce_operacion'.
-- Para recuperarlo íntegro, ver supabase/exportar-migraciones.md.
--
-- Tablas creadas por esta migración:
--   price_lists · price_list_items · customers · customer_addresses
--   customer_special_prices · orders · order_items · order_status_history
--   routes · deliveries · payments · opening_receivables · opening_payables
--   processing_orders · processing_outputs · processing_yields · losses
--   stock_reservations · company_config · notifications · user_invitations
--
-- Todas con: company_id not null referenciando companies, índice por company_id
-- e índice de cobertura en cada clave foránea, único por (company_id, code),
-- disparador set_company_current(), y RLS con nivel 40 para operación y 60
-- para dinero (payments, opening_*, user_invitations).
