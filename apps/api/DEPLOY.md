# Despliegue de Quadra API en Google Cloud Run

Solo los pasos. **No se ejecutan desde esta rama.** El despliegue lo lanza el equipo con aprobación de Aroldo.
Usa los placeholders `<PROJECT_ID>` y `<REGION>` (por ejemplo `us-central1`). Corre los comandos desde la raíz
del repo.

## 1. Proyecto y APIs

```bash
gcloud config set project <PROJECT_ID>
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  cloudbuild.googleapis.com secretmanager.googleapis.com --project <PROJECT_ID>
```

## 2. Secretos en Secret Manager

Aroldo pega cada valor por stdin. Los valores nunca van en git, en la línea de comandos ni en el chat.

```bash
gcloud secrets create DATABASE_URL        --replication-policy=automatic --project <PROJECT_ID>
gcloud secrets create SUPABASE_SECRET_KEY --replication-policy=automatic --project <PROJECT_ID>
gcloud secrets create ANTHROPIC_API_KEY   --replication-policy=automatic --project <PROJECT_ID>

# Cargar o rotar un valor: pegar, Enter y Ctrl-D
gcloud secrets versions add DATABASE_URL        --data-file=- --project <PROJECT_ID>
gcloud secrets versions add SUPABASE_SECRET_KEY --data-file=- --project <PROJECT_ID>
gcloud secrets versions add ANTHROPIC_API_KEY   --data-file=- --project <PROJECT_ID>
```

`DATABASE_URL` es el session pooler de Supabase (IPv4, `aws-1-us-west-2.pooler.supabase.com`, puerto **5432**,
usuario `postgres.<ref>`). Si se usa el pooler en modo transacción (puerto 6543), el API apaga solo los
prepared statements. El cliente valida TLS con la CA oficial de Supabase `apps/api/certs/prod-ca-2021.crt`
(PR #8); no se desactiva `rejectUnauthorized`.

El runtime de Cloud Run usa la cuenta de servicio dedicada **`quadra-api-run`**, no la de Compute.
El script `apps/api/scripts/deploy-cloudrun.sh` la crea si no existe y le otorga `roles/secretmanager.secretAccessor`
solo sobre cada secreto que inyecta (`DATABASE_URL` y `SUPABASE_SECRET_KEY`; `ANTHROPIC_API_KEY` es opcional).

```bash
SA_EMAIL="quadra-api-run@<PROJECT_ID>.iam.gserviceaccount.com"
gcloud iam service-accounts create quadra-api-run \
  --display-name="Quadra API Cloud Run" --project <PROJECT_ID>
for s in DATABASE_URL SUPABASE_SECRET_KEY; do
  gcloud secrets add-iam-policy-binding "$s" --project <PROJECT_ID> \
    --member="serviceAccount:${SA_EMAIL}" \
    --role=roles/secretmanager.secretAccessor
done
```

## 3. Deploy

Lo habitual es el script idempotente `apps/api/scripts/deploy-cloudrun.sh`, con
`CLOUDSDK_CONFIG=<repo>/.local/gcloud` (nunca el proyecto `saf-world`).
`--source apps/api` construye con el `Dockerfile` de `apps/api` en Cloud Build y publica en Artifact Registry.

`CORS_ORIGIN` vigente: `https://hackathon-build-pitch-bts.vercel.app,http://localhost:5173`
(sin "/" final, sin `*` ni `*.vercel.app`).

```bash
SA_EMAIL="quadra-api-run@<PROJECT_ID>.iam.gserviceaccount.com"
gcloud run deploy quadra-api \
  --source apps/api \
  --region <REGION> \
  --project <PROJECT_ID> \
  --service-account "$SA_EMAIL" \
  --allow-unauthenticated \
  --set-env-vars '^;^SUPABASE_URL=https://<project-ref>.supabase.co;SUPABASE_JWKS_URL=https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json;SUPABASE_PUBLISHABLE_KEY=<publishable-key>;CORS_ORIGIN=https://hackathon-build-pitch-bts.vercel.app,http://localhost:5173' \
  --set-secrets DATABASE_URL=DATABASE_URL:<version>,SUPABASE_SECRET_KEY=SUPABASE_SECRET_KEY:<version>
```

Usa una versión habilitada verificada de cada secreto (no asumas `:1` ni dejes de comprobarla). `ANTHROPIC_API_KEY` solo se añade a `--set-secrets` si hace falta; el API arranca sin ella.

- `--allow-unauthenticated` solo abre el servicio a nivel de Cloud Run para que el navegador llegue. La
  autorización real la hace el API: cada ruta de negocio exige un JWT de Supabase verificado contra el JWKS, y
  Postgres aplica RLS con ese usuario. Son públicos `/api/health`, `/api/docs` y `/api/openapi.json`.
- `PORT` lo inyecta Cloud Run (8080); el contenedor escucha en `0.0.0.0:$PORT`.
- `CORS_ORIGIN` es una lista de orígenes exactos separados por coma (sin `*`). Cloud Run pone
  `NODE_ENV=production`: si la variable falta, está vacía o contiene `*`, el contenedor no arranca. Como
  `--set-env-vars` también usa comas para separar variables, el delimitador se cambia a `;` con el prefijo `^;^`.
- La imagen no lleva `.env` ni secretos (`.dockerignore`).

## 4. Verificación

```bash
URL=$(gcloud run services describe quadra-api --region <REGION> --project <PROJECT_ID> --format='value(status.url)')
curl -s "$URL/api/health"                 # {"status":"ok","service":"quadra-api"}
curl -s -o /dev/null -w '%{http_code}\n' "$URL/api/docs"           # 200, Swagger UI
curl -s -o /dev/null -w '%{http_code}\n' "$URL/api/openapi.json"   # 200
curl -s -o /dev/null -w '%{http_code}\n' "$URL/api/loads"          # 401 sin token
```

En el front: `VITE_API_URL=$URL/api`.
