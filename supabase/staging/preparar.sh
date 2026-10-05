#!/usr/bin/env bash
# Deja un proyecto Supabase NUEVO y VACÍO igual a producción en esquema, con
# datos ficticios. Se corre una sola vez por proyecto de staging.
#
#   STAGING_DB_URL='postgresql://postgres:…@db.<ref>.supabase.co:5432/postgres' \
#     supabase/staging/preparar.sh
#
# Antes de correrlo: crear en Authentication → Users la cuenta
# sarkgraff@gmail.com (sin confirmar basta). Las migraciones de datos 0069 en
# adelante la buscan; sin ella se detienen.
set -euo pipefail
: "${STAGING_DB_URL:?Falta STAGING_DB_URL (la conexión del proyecto de STAGING)}"

# Producción y el proyecto de Bilagay nunca. No hay forma de saltarse esto.
case "$STAGING_DB_URL" in
  *jwxeowowuxmijuexdrua*|*owfvuusxfvzjgxfmllpt*)
    echo "✗ Esa URL es de PRODUCCIÓN. Este script es solo para staging." >&2; exit 1 ;;
esac

raiz="$(cd "$(dirname "$0")/../.." && pwd)"
ya=$(psql "$STAGING_DB_URL" -At -c "select count(*) from pg_tables where schemaname = 'public'")
if [ "$ya" != "0" ]; then
  echo "✗ La base ya tiene $ya tablas en public. Este script es para un proyecto vacío." >&2; exit 1
fi

total=0
for f in "$raiz"/supabase/migrations/*.sql; do
  if ! psql "$STAGING_DB_URL" -q -v ON_ERROR_STOP=1 -X -f "$f" >/dev/null; then
    echo "✗ $(basename "$f")"; exit 1
  fi
  total=$((total + 1))
done
echo "✓ $total migraciones"

# Los crons de 0134-0139 llaman a las Edge Functions con la URL de
# PRODUCCIÓN escrita en el SQL. En staging se apagan: producción las
# rechazaría (la llave del cron no coincide), pero no hay por qué llamarla.
psql "$STAGING_DB_URL" -q -X -c "select cron.unschedule(jobname) from cron.job" >/dev/null
echo "✓ crons apagados en staging"
psql "$STAGING_DB_URL" -q -v ON_ERROR_STOP=1 -X -f "$raiz/supabase/seed.sql" >/dev/null
echo "✓ seed.sql (cuentas *@anima.test, contraseña anima-staging)"
psql "$STAGING_DB_URL" -q -v ON_ERROR_STOP=1 -X -f "$raiz/supabase/tests/reconstruir/aislamiento_seed.sql" 2>&1 | grep -o "Aislamiento.*" || true
