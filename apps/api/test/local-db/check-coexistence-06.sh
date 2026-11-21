#!/usr/bin/env bash
# SOLO DESARROLLO / PRUEBAS, base LOCAL aparte. Comprueba que el motor (07) convive con el seed 06:
#   1. crea la base local (por defecto quadra_check06) con stubs + 01..06 + 07
#   2. huella (md5) de todas las filas de las corridas existentes del 06
#   3. corre fnConsolidar('PPTO_V2') como GROUP_CONTROLLER (RLS) y fnConsolidar('PPTO_V1') (debe fallar: sin cargas APROBADA)
#   4. verifica: las corridas del 06 no cambiaron, hay exactamente una corrida nueva y su consolidado
#      coincide (±1 USD por cuenta) con la corrida de referencia V2 del 06.
# Rechaza cualquier host no local: el 06 y el 07 NUNCA se corren contra la base en vivo desde aquí.
set -euo pipefail
DB_URL="${CHECK06_DB_URL:-postgres://postgres@127.0.0.1:54329/quadra_check06}"
case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*|*@127.0.0.1/*|*@localhost/*) ;;
  *) echo "Solo se permite una base local (127.0.0.1 / localhost)" >&2; exit 1 ;;
esac
HERE="$(cd "$(dirname "$0")" && pwd)"
SQL_DIR="$(cd "$HERE/../../../../hackathon-consolidacion/supabase" && pwd)"
LOCAL_DB_URL="$DB_URL" bash "$HERE/setup-local-db.sh" >/dev/null
for f in 06_seed_demo_data.sql 07_motor_conciliar_consolidar.sql; do
  echo "-> $f"; psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$SQL_DIR/$f" >/dev/null
done
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$HERE/check-coexistence-06.sql"
