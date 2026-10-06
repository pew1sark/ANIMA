#!/usr/bin/env bash
# ¿Las migraciones del repo reconstruyen el esquema desde cero?
#
# Aplica supabase_minimo.sql y después cada archivo de supabase/migrations en
# orden de nombre, sobre una base VACÍA. Se detiene en el primero que falla.
#
#   PGHOST=localhost PGPORT=5432 PGUSER=postgres supabase/tests/reconstruir/reconstruir.sh
#
# Usa las variables estándar de libpq (PGHOST, PGPORT, PGUSER, PGPASSWORD).
# Nunca apuntarlo a producción ni a staging: crea y borra la base `reconstruir`.
set -euo pipefail
: "${PGHOST:?Falta PGHOST (un Postgres desechable)}"
aqui="$(cd "$(dirname "$0")" && pwd)"
raiz="$(cd "$aqui/../../.." && pwd)"
base=reconstruir

psql -d postgres -qAt -c "drop database if exists reconstruir" -c "create database reconstruir" >/dev/null
psql -d "$base" -q -v ON_ERROR_STOP=1 -f "$aqui/supabase_minimo.sql" >/dev/null

total=0
for f in "$raiz"/supabase/migrations/*.sql; do
  n=$(basename "$f")
  # pg_cron y pg_net no existen fuera de Supabase: sus funciones las pone
  # supabase_minimo.sql, así que el `create extension` se salta.
  if ! sed -E 's/^\s*create extension (if not exists )?(pg_cron|pg_net)[^;]*;/-- (omitido) &/I' "$f" \
       | psql -d "$base" -q -v ON_ERROR_STOP=1 -X >/dev/null 2>"$aqui/.error"; then
    echo "✗ $n"
    cat "$aqui/.error"
    exit 1
  fi
  total=$((total + 1))
done
rm -f "$aqui/.error"
echo "✓ $total migraciones aplicadas sin error"

# El seed tiene que entrar limpio sobre la base reconstruida, y con él se
# prueba el aislamiento entre organizaciones con usuarios de verdad.
psql -d "$base" -q -v ON_ERROR_STOP=1 -X -f "$raiz/supabase/seed.sql" >/dev/null
echo "✓ seed.sql aplicado"
if ! salida=$(psql -d "$base" -q -v ON_ERROR_STOP=1 -X -f "$aqui/aislamiento_seed.sql" 2>&1); then
  echo "✗ aislamiento"; echo "$salida"; exit 1
fi
echo "✓ $(grep -o 'Aislamiento del seed.*' <<< "$salida")"
psql -d "$base" -At -c "
  select 'tablas '      || count(*) from pg_tables where schemaname = 'public'
  union all select 'sin RLS '   || count(*) from pg_tables where schemaname = 'public' and not rowsecurity
  union all select 'vistas '    || count(*) from pg_views where schemaname = 'public'
  union all select 'funciones ' || count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
  union all select 'políticas ' || count(*) from pg_policies where schemaname = 'public'"
