#!/usr/bin/env bash
set -euo pipefail
: "${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"
: "${BACKEND_DIR:?Set BACKEND_DIR to the NestJS source directory}"
: "${RUNTIME_SERVICE_ACCOUNT:?Set RUNTIME_SERVICE_ACCOUNT to the service-account email}"
: "${DATABASE_SECRET_VERSION:?Set DATABASE_SECRET_VERSION, e.g. quadra-database-url:1}"
: "${ENV_FILE:?Set ENV_FILE to the completed env.local.yaml path}"
REGION="${GCP_REGION:-us-central1}"
SERVICE="${CLOUD_RUN_SERVICE:-quadra-api}"
command -v gcloud >/dev/null || { echo "Install Google Cloud CLI first."; exit 1; }
test -f "$BACKEND_DIR/Dockerfile" || { echo "Copy deploy/cloud-run/Dockerfile to backend first."; exit 1; }
test -f "$BACKEND_DIR/package-lock.json" || { echo "Backend needs package-lock.json."; exit 1; }
test -f "$ENV_FILE" || { echo "Environment YAML does not exist."; exit 1; }
# Deliberately no database migrations: review and execute separately.
# Public ingress is required for browser requests; NestJS MUST validate Supabase JWTs.
gcloud run deploy "$SERVICE" \
  --project "$GCP_PROJECT_ID" \
  --region "$REGION" \
  --source "$BACKEND_DIR" \
  --service-account "$RUNTIME_SERVICE_ACCOUNT" \
  --port 8080 \
  --allow-unauthenticated \
  --env-vars-file "$ENV_FILE" \
  --set-secrets "DATABASE_URL=$DATABASE_SECRET_VERSION" \
  --memory 512Mi \
  --cpu 1 \
  --concurrency 20 \
  --min-instances 0 \
  --max-instances 2 \
  --timeout 300
gcloud run services describe "$SERVICE" \
  --project "$GCP_PROJECT_ID" --region "$REGION" \
  --format='value(status.url)'
