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

`DATABASE_URL` es el session pooler de Supabase o la conexión directa (puerto **5432**). Si se usa el pooler
en modo transacción (puerto 6543), el API apaga solo los prepared statements.

La cuenta de servicio de Cloud Run necesita leer los secretos. Por defecto es la de Compute:
`<PROJECT_NUMBER>-compute@developer.gserviceaccount.com`.

```bash
PROJECT_NUMBER=$(gcloud projects describe <PROJECT_ID> --format='value(projectNumber)')
for s in DATABASE_URL SUPABASE_SECRET_KEY ANTHROPIC_API_KEY; do
  gcloud secrets add-iam-policy-binding "$s" --project <PROJECT_ID> \
    --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role=roles/secretmanager.secretAccessor
done
```

## 3. Deploy

`--source apps/api` construye con el `Dockerfile` de `apps/api` en Cloud Build y publica en Artifact Registry.

```bash
gcloud run deploy quadra-api \
  --source apps/api \
  --region <REGION> \
  --project <PROJECT_ID> \
  --allow-unauthenticated \
  --set-env-vars SUPABASE_URL=https://<project-ref>.supabase.co,SUPABASE_JWKS_URL=https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json,SUPABASE_PUBLISHABLE_KEY=<publishable-key>,CORS_ORIGIN=* \
  --set-secrets DATABASE_URL=DATABASE_URL:latest,SUPABASE_SECRET_KEY=SUPABASE_SECRET_KEY:latest,ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest
```

- `--allow-unauthenticated` solo abre el servicio a nivel de Cloud Run para que el navegador llegue. La
  autorización real la hace el API: cada ruta de negocio exige un JWT de Supabase verificado contra el JWKS, y
  Postgres aplica RLS con ese usuario. Solo `/api/health` es público.
- `PORT` lo inyecta Cloud Run (8080); el contenedor escucha en `0.0.0.0:$PORT`.
- `CORS_ORIGIN=*` sirve para la demo. Para cerrarlo, usa los orígenes exactos del front separados por coma. Como
  `--set-env-vars` usa comas para separar variables, en ese caso hay que cambiar el delimitador:
  `--set-env-vars '^;^SUPABASE_URL=...;CORS_ORIGIN=https://a.app,https://b.app'`.
- La imagen no lleva `.env` ni secretos (`.dockerignore`).

## 4. Verificación

```bash
URL=$(gcloud run services describe quadra-api --region <REGION> --project <PROJECT_ID> --format='value(status.url)')
curl -s "$URL/api/health"                 # {"status":"ok","service":"quadra-api"}
curl -s -o /dev/null -w '%{http_code}\n' "$URL/api/loads"   # 401 sin token
```

En el front: `VITE_API_URL=$URL/api`.
