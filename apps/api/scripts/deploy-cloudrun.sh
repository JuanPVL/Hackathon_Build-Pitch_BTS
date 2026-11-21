#!/usr/bin/env bash
# Despliega apps/api en Google Cloud Run (proyecto quadra-66e75, servicio quadra-api).
# Idempotente. No imprime secretos. No corre seeds ni migraciones. No hace git push ni merge.
#
# Uso (desde cualquier carpeta):
#   apps/api/scripts/deploy-cloudrun.sh \
#     --cors-origin 'http://localhost:5173,https://TU-DOMINIO.vercel.app' \
#     --database-url-file /ruta/local/database_url \
#     --supabase-secret-key-file /ruta/local/supabase_secret_key \
#     [--anthropic-key-file /ruta/local/anthropic_api_key]
#
# Si un secreto ya existe en Secret Manager, el archivo es opcional (se reutiliza la
# última versión habilitada). ANTHROPIC_API_KEY es opcional: si no se pasa ni existe,
# el servicio arranca sin ella.
#
# Requiere gcloud autenticado en la config aislada <repo>/.local/gcloud (nunca saf-world):
#   export CLOUDSDK_CONFIG="$PWD/.local/gcloud"
#   gcloud auth login aroldol005@gmail.com
#   gcloud config set project quadra-66e75
#   gcloud config set run/region us-central1
set -euo pipefail

usage() {
  sed -n '2,20p' "$0" | sed 's/^# \?//'
  exit 2
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
API_DIR="$REPO_ROOT/apps/api"

PROJECT="${GCP_PROJECT_ID:-quadra-66e75}"
REGION="${GCP_REGION:-us-central1}"
SERVICE="${CLOUD_RUN_SERVICE:-quadra-api}"
SA_ID="quadra-api-run"
CORS_ORIGIN=""
DATABASE_URL_FILE=""
SUPABASE_SECRET_KEY_FILE=""
ANTHROPIC_KEY_FILE=""
SUPABASE_URL="https://jqfmfyvahaeqtomnexmn.supabase.co"
SUPABASE_PUBLISHABLE_KEY="sb_publishable_4DpNPYLxZB4omFXjEBM8vA_xT89WVMU"
SUPABASE_JWKS_URL="https://jqfmfyvahaeqtomnexmn.supabase.co/auth/v1/.well-known/jwks.json"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --cors-origin) CORS_ORIGIN="${2:?}"; shift 2 ;;
    --database-url-file) DATABASE_URL_FILE="${2:?}"; shift 2 ;;
    --supabase-secret-key-file) SUPABASE_SECRET_KEY_FILE="${2:?}"; shift 2 ;;
    --anthropic-key-file) ANTHROPIC_KEY_FILE="${2:?}"; shift 2 ;;
    --project) PROJECT="${2:?}"; shift 2 ;;
    --region) REGION="${2:?}"; shift 2 ;;
    --service) SERVICE="${2:?}"; shift 2 ;;
    --supabase-url) SUPABASE_URL="${2:?}"; shift 2 ;;
    --supabase-publishable-key) SUPABASE_PUBLISHABLE_KEY="${2:?}"; shift 2 ;;
    --supabase-jwks-url) SUPABASE_JWKS_URL="${2:?}"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "Argumento no reconocido: $1" >&2; usage ;;
  esac
done

if [[ -z "$CORS_ORIGIN" ]]; then
  echo "Falta --cors-origin con una lista exacta de orígenes separados por coma (sin '*')." >&2
  exit 1
fi
if [[ "$CORS_ORIGIN" == *"*"* ]]; then
  echo "CORS_ORIGIN no admite comodines." >&2
  exit 1
fi
if [[ "$CORS_ORIGIN" == *";"* ]]; then
  echo "CORS_ORIGIN no puede contener ';' (es el delimitador de --set-env-vars)." >&2
  exit 1
fi

# Config aislada: no toca ~/.config/gcloud ni el proyecto saf-world.
export CLOUDSDK_CONFIG="${CLOUDSDK_CONFIG:-$REPO_ROOT/.local/gcloud}"
mkdir -p "$CLOUDSDK_CONFIG"

command -v gcloud >/dev/null || { echo "Instala Google Cloud CLI (gcloud)." >&2; exit 1; }

ACCOUNT="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | head -n1 || true)"
if [[ -z "$ACCOUNT" ]]; then
  echo "No hay una cuenta autenticada en CLOUDSDK_CONFIG=$CLOUDSDK_CONFIG." >&2
  echo "Aroldo debe correr en su Terminal:" >&2
  echo "  export CLOUDSDK_CONFIG=\"$REPO_ROOT/.local/gcloud\"" >&2
  echo "  mkdir -p \"\$CLOUDSDK_CONFIG\"" >&2
  echo "  gcloud auth login aroldol005@gmail.com" >&2
  echo "  gcloud config set project $PROJECT" >&2
  echo "  gcloud config set run/region $REGION" >&2
  echo "  gcloud auth list" >&2
  exit 1
fi

gcloud config set project "$PROJECT" --quiet
gcloud config set run/region "$REGION" --quiet

# Verificar facturación ANTES de habilitar APIs.
BILLING_ENABLED="$(gcloud billing projects describe "$PROJECT" --format='value(billingEnabled)' 2>/dev/null || true)"
if [[ "${BILLING_ENABLED,,}" != "true" ]]; then
  echo "El proyecto $PROJECT no tiene facturación vinculada (billingEnabled=${BILLING_ENABLED:-false})." >&2
  echo "Aroldo debe vincular una cuenta en:" >&2
  echo "  https://console.cloud.google.com/billing/linkedaccount?project=$PROJECT" >&2
  echo "Y luego volver a correr este script." >&2
  exit 1
fi

echo "Facturación vinculada. Habilitando APIs (idempotente)…"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  --project "$PROJECT"

SA_EMAIL="$SA_ID@$PROJECT.iam.gserviceaccount.com"
if gcloud iam service-accounts describe "$SA_EMAIL" --project "$PROJECT" >/dev/null 2>&1; then
  echo "Cuenta de servicio ya existe: $SA_EMAIL"
else
  echo "Creando cuenta de servicio $SA_EMAIL"
  gcloud iam service-accounts create "$SA_ID" \
    --display-name="Quadra API Cloud Run" \
    --project "$PROJECT"
fi

# El usuario que despliega necesita actuar como esa cuenta.
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --project "$PROJECT" \
  --member="user:$ACCOUNT" \
  --role="roles/iam.serviceAccountUser" \
  --quiet >/dev/null

secret_exists() {
  gcloud secrets describe "$1" --project "$PROJECT" >/dev/null 2>&1
}

# Añade una versión desde un archivo, por stdin, sin imprimir el valor.
add_secret_version() {
  local name="$1" file="$2"
  if [[ ! -f "$file" ]]; then
    echo "No existe el archivo indicado para $name." >&2
    exit 1
  fi
  if [[ ! -s "$file" ]]; then
    echo "El archivo indicado para $name está vacío." >&2
    exit 1
  fi
  if ! secret_exists "$name"; then
    gcloud secrets create "$name" --replication-policy=automatic --project "$PROJECT"
  fi
  # Recorta solo saltos finales; no deja el valor en una variable de bash ni en el log.
  python3 -c 'import sys; sys.stdout.buffer.write(sys.stdin.buffer.read().strip(b"\r\n"))' < "$file" \
    | gcloud secrets versions add "$name" --data-file=- --project "$PROJECT" >/dev/null
}

enabled_version() {
  local name="$1" ver
  ver="$(gcloud secrets versions list "$name" \
    --project "$PROJECT" \
    --filter='state=ENABLED' \
    --sort-by='~createTime' \
    --format='value(name)' \
    --limit=1)"
  if [[ -z "$ver" ]]; then
    echo "No hay una versión habilitada del secreto $name." >&2
    exit 1
  fi
  echo "${ver##*/}"
}

grant_secret_accessor() {
  local name="$1"
  gcloud secrets add-iam-policy-binding "$name" \
    --project "$PROJECT" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="roles/secretmanager.secretAccessor" \
    --quiet >/dev/null
}

ensure_required_secret() {
  local name="$1" file="$2"
  if [[ -n "$file" ]]; then
    add_secret_version "$name" "$file"
  elif ! secret_exists "$name"; then
    echo "Falta el secreto $name y no se pasó el archivo para crearlo." >&2
    exit 1
  fi
  grant_secret_accessor "$name"
}

ensure_required_secret DATABASE_URL "$DATABASE_URL_FILE"
ensure_required_secret SUPABASE_SECRET_KEY "$SUPABASE_SECRET_KEY_FILE"

DATABASE_URL_VERSION="$(enabled_version DATABASE_URL)"
SUPABASE_SECRET_KEY_VERSION="$(enabled_version SUPABASE_SECRET_KEY)"
echo "Versiones de secretos (solo números): DATABASE_URL=$DATABASE_URL_VERSION SUPABASE_SECRET_KEY=$SUPABASE_SECRET_KEY_VERSION"

SET_SECRETS="DATABASE_URL=DATABASE_URL:${DATABASE_URL_VERSION},SUPABASE_SECRET_KEY=SUPABASE_SECRET_KEY:${SUPABASE_SECRET_KEY_VERSION}"

if [[ -n "$ANTHROPIC_KEY_FILE" ]]; then
  add_secret_version ANTHROPIC_API_KEY "$ANTHROPIC_KEY_FILE"
  grant_secret_accessor ANTHROPIC_API_KEY
  ANTHROPIC_VERSION="$(enabled_version ANTHROPIC_API_KEY)"
  SET_SECRETS="${SET_SECRETS},ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:${ANTHROPIC_VERSION}"
  echo "ANTHROPIC_API_KEY versión $ANTHROPIC_VERSION (opcional, incluida)"
else
  echo "ANTHROPIC_API_KEY no se inyecta (opcional; el API arranca sin ella)"
fi

test -f "$API_DIR/Dockerfile" || { echo "No encuentro $API_DIR/Dockerfile" >&2; exit 1; }
test -f "$API_DIR/package-lock.json" || { echo "No encuentro $API_DIR/package-lock.json" >&2; exit 1; }

# Delimitador ^;^ para que CORS_ORIGIN pueda llevar comas. Sin migraciones al arrancar.
echo "Desplegando $SERVICE en $REGION (source=$API_DIR)…"
gcloud run deploy "$SERVICE" \
  --project "$PROJECT" \
  --region "$REGION" \
  --source "$API_DIR" \
  --service-account "$SA_EMAIL" \
  --port 8080 \
  --allow-unauthenticated \
  --set-env-vars "^;^NODE_ENV=production;SUPABASE_URL=${SUPABASE_URL};SUPABASE_JWKS_URL=${SUPABASE_JWKS_URL};SUPABASE_PUBLISHABLE_KEY=${SUPABASE_PUBLISHABLE_KEY};CORS_ORIGIN=${CORS_ORIGIN}" \
  --set-secrets "$SET_SECRETS" \
  --memory 512Mi \
  --cpu 1 \
  --concurrency 20 \
  --min-instances 0 \
  --max-instances 2 \
  --timeout 300

URL="$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format='value(status.url)')"
echo "URL del servicio: $URL"
echo "Health: $URL/api/health"
echo "OpenAPI: $URL/api/openapi.json"
echo "Swagger UI: $URL/api/docs"
echo "VITE_API_URL=$URL/api"
