# Reconstrucción de la base

¿Las migraciones del repo levantan el esquema de producción desde cero? Este
script lo responde en un Postgres desechable. Lo corre CI en cada PR.

```bash
PGHOST=localhost PGPORT=5432 PGUSER=postgres supabase/tests/reconstruir/reconstruir.sh
```

1. Crea la base `reconstruir` (borra la anterior).
2. `supabase_minimo.sql`: imita lo que Supabase trae y las migraciones usan
   (roles, `auth.uid()`, `storage`, `cron`, `net`, `vault`, `supabase_realtime`)
   y crea la cuenta del Creador que buscan las migraciones de datos.
3. Aplica `supabase/migrations/*.sql` en orden. `create extension pg_cron/pg_net`
   se salta: sus funciones las pone el paso 2.
4. Carga `supabase/seed.sql`.
5. `aislamiento_seed.sql`: 15 comprobaciones de quién ve qué con los usuarios
   del seed. Falla si una política deja ver de más o de menos.

**Nunca apuntarlo a staging ni a producción**: borra y crea bases. Para
staging está `supabase/staging/preparar.sh`.

Ver [`docs/MIGRACIONES.md`](../../../docs/MIGRACIONES.md).
