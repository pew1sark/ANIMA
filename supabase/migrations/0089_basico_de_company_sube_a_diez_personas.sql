begin;

-- El plan Básico de COMPANY venía con dos personas incluidas, heredado del
-- viejo Starter. Con solo tres planes en la línea, ese cupo dejaba un hueco
-- absurdo entre Básico y Pro (2 → 25) y no se parecía a ninguna empresa real:
-- una empresa chica con clientes y agenda ya es más de dos personas.

update public.plans set max_users = 10 where slug = 'starter';

commit;
