-- 0075 · Arregla el disparador que fija el estado de un cobro.
--
-- Fallaba con: operator does not exist: charge_status = text
--
-- La comparacion era `status is distinct from (case ... then 'pagado' ... end)`.
-- El case devuelve text y status es charge_status: en una ASIGNACION Postgres
-- convierte solo, pero en una COMPARACION no hay operador y revienta.
--
-- Se resuelve calculando el estado en una variable ya tipada, que ademas se lee
-- mejor. Detectado registrando un pago de verdad desde la consola.

create or replace function public.trg_platform_charge_status()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $fn$
declare v_charge uuid; v_pagado bigint; v_monto bigint; v_nuevo public.charge_status;
begin
  v_charge := coalesce(new.charge_id, old.charge_id);

  select coalesce(sum(amount),0) into v_pagado from public.platform_payments where charge_id = v_charge;
  select amount into v_monto from public.platform_charges where id = v_charge;

  v_nuevo := case when v_pagado >= v_monto and v_monto > 0
                  then 'pagado'::public.charge_status
                  else 'pendiente'::public.charge_status end;

  update public.platform_charges
     set status = v_nuevo, updated_at = now()
   where id = v_charge
     and status <> 'anulado'          -- un cobro anulado no vuelve solo
     and status is distinct from v_nuevo;

  return coalesce(new, old);
end $fn$;
revoke execute on function public.trg_platform_charge_status() from public, anon, authenticated;
