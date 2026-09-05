-- 0104 · Un mes es un mes, aunque se escriba el día 17.
--
-- `ci_actuals.period` tiene un check que exige el día 1: un movimiento
-- pertenece a un MES, y guardar unos el día 1 y otros el 17 rompe
-- cualquier comparación contra el presupuesto.
--
-- El problema es que el motor de datos dibuja un campo de fecha
-- normal, y quien carga un gasto escribe el día en que ocurrió. La
-- salida elegante no es explicarle la regla a la persona: es que la
-- base la aplique. Lo que se escriba se guarda como el día 1.
--
-- De paso, el valor convertido se calcula UNA VEZ, al escribir, y no
-- al leer. Es la diferencia entre un dato histórico y una cifra que
-- cambia sola cuando alguien carga la tasa de mañana.
create or replace function public.ci_normaliza_periodo()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.period := date_trunc('month', new.period)::date;
  if new.fx_rate is not null and new.base_amount is null then
    new.base_amount := round(coalesce(new.actual_amount, 0) * new.fx_rate, 2);
  end if;
  if new.fx_rate is not null and new.fx_date is null then
    new.fx_date := new.period;
  end if;
  return new;
end $$;
revoke execute on function public.ci_normaliza_periodo() from public, anon, authenticated;

drop trigger if exists ci_actuals_normaliza on public.ci_actuals;
create trigger ci_actuals_normaliza before insert or update on public.ci_actuals
  for each row execute function public.ci_normaliza_periodo();

comment on function public.ci_normaliza_periodo() is
  'Un movimiento pertenece a un MES. Lo que se escriba en el campo de fecha se guarda como el día 1, y el valor convertido se calcula una vez, al escribir.';
