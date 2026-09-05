-- ===========================================================
-- 0100 · CAPITAL INTELLIGENCE — el panel ejecutivo
-- -----------------------------------------------------------
-- NOTA DE HONESTIDAD SOBRE ESTE ARCHIVO
-- La versión que se aplicó a la base el 04-09-2026 traía además un
-- primer intento de `ci_resumen()` que resolvía la lista de
-- proyectos con una TABLA TEMPORAL. No funciona: PostgreSQL
-- responde «CREATE TABLE is not allowed in a non-volatile function»
-- y la única forma de que pasara habría sido declarar VOLATILE una
-- función que solo lee. Se corrigió en 0100b, que reemplaza
-- `ci_resumen()` entera. Aquí queda lo que sí sirve de esta
-- migración —la conversión de monedas— y el intento fallido no se
-- reproduce, porque replicarlo solo para pisarlo dos archivos más
-- abajo no ayuda a nadie a entender el sistema.
-- ===========================================================

-- Conversión entre monedas con la tasa vigente a una fecha.
-- Devuelve null cuando no hay tasa: es la respuesta honesta, y el
-- panel la convierte en una alerta en vez de inventar un número.
--
-- El valor convertido NO se deriva al vuelo en las transacciones:
-- ahí se guarda (ver ci_actuals.base_amount). Esto es para
-- consolidar a la moneda de la organización en pantalla, donde sí
-- corresponde usar la tasa vigente.
create or replace function public.ci_convertir(
  p_company uuid, p_monto numeric, p_de text, p_a text, p_fecha date default current_date)
returns numeric language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when p_monto is null then null
    when p_de is null or p_a is null or upper(p_de) = upper(p_a) then p_monto
    else p_monto * (select r.rate from public.ci_exchange_rates r
                     where r.company_id = p_company
                       and upper(r.base_currency) = upper(p_de)
                       and upper(r.quote_currency) = upper(p_a)
                       and r.rate_date <= p_fecha
                     order by r.rate_date desc limit 1)
  end;
$$;
revoke execute on function public.ci_convertir(uuid,numeric,text,text,date) from public, anon;
grant  execute on function public.ci_convertir(uuid,numeric,text,text,date) to authenticated;
