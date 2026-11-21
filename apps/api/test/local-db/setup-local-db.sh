#!/usr/bin/env bash
# SOLO DESARROLLO / PRUEBAS. Crea una base PostgreSQL local y carga, en orden:
#   00_supabase_stubs.sql (este directorio), supabase/01..05 del paquete y el motor 07
#   (07_motor_conciliar_consolidar.sql: solo funciones; NO aplicado a la base en vivo).
# El seed 06 NO se carga nunca (no es idempotente y es exclusivo del proyecto Supabase).
# Rechaza cualquier host que no sea local para no tocar la base en vivo.
set -euo pipefail
LOCAL_DB_URL="${LOCAL_DB_URL:-${TEST_DATABASE_URL:-}}"
: "${LOCAL_DB_URL:?Define LOCAL_DB_URL o TEST_DATABASE_URL, p. ej. postgres://postgres@127.0.0.1:54329/quadra_test}"
case "$LOCAL_DB_URL" in
  *@127.0.0.1:*|*@localhost:*|*@127.0.0.1/*|*@localhost/*) ;;
  *) echo "Solo se permite una base local (127.0.0.1 / localhost)" >&2; exit 1 ;;
esac
HERE="$(cd "$(dirname "$0")" && pwd)"
SQL_DIR="$(cd "$HERE/../../../../hackathon-consolidacion/supabase" && pwd)"
DB_NAME="${LOCAL_DB_URL##*/}"; DB_NAME="${DB_NAME%%\?*}"
ADMIN_URL="${LOCAL_DB_URL%/*}/postgres"
psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -qc "drop database if exists \"$DB_NAME\" with (force)"
psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -qc "create database \"$DB_NAME\""
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -q -f "$HERE/00_supabase_stubs.sql"
for f in 01_schema.sql 02_seed_master_data.sql 03_seed_loads_v1_with_errors.sql 04_seed_loads_v2.sql 05_security_rls.sql \
         07_motor_conciliar_consolidar.sql; do
  echo "-> $f"
  psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -q -f "$SQL_DIR/$f" >/dev/null
done
echo "Base local lista: $DB_NAME (01-05 + 07, sin seed 06)"
