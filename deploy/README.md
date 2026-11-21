# Despliegue de Quadra: Vercel + Cloud Run + Supabase

Destino principal: React en Vercel, NestJS en Cloud Run, PostgreSQL y Auth en Supabase.
compose.yaml queda como alternativa para servidor propio.
No se ha publicado ningún servicio con estas plantillas.

## 1. Preparar el backend NestJS

El código del backend todavía no está en este repositorio. Copiar cloud-run/Dockerfile
y cloud-run/.dockerignore a su raíz (junto a package.json).
La plantilla usa npm, package-lock.json y salida dist/main.js; ajustar al backend real.

En el bootstrap existente de NestJS, incorporar antes de listen:

    const origins = (process.env.FRONTEND_ORIGINS ?? '')
      .split(',').map(value => value.trim()).filter(Boolean);
    app.enableCors({
      origin: origins,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type'],
    });
    app.setGlobalPrefix('api'); // solo si no se ha configurado antes
    app.enableShutdownHooks();
    await app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');

FRONTEND_ORIGINS debe contener orígenes exactos, sin / final.
Agregar dominios preview concretos solo si se van a probar; no permitir *.vercel.app.
El frontend envía Bearer JWT, no cookies; no necesita credentials: true.
El guard del backend debe validar JWT de Supabase y permisos en cada endpoint privado.
Cloud Run admite HTTP público para que el navegador llegue al servicio; la autorización
del usuario sigue siendo responsabilidad de NestJS.

Crear GET /api/health público con respuesta mínima {"status":"ok"} y sin secretos.
No usarlo como prueba de conectividad DB salvo que realmente consulte la base.
No ejecutar drizzle push/migraciones automáticamente al arrancar cada instancia.

Drizzle + postgres-js: usar URL de pooler Supabase, max pequeño (p. ej. 5 por instancia).
Si se usa transaction pooler (6543), configurar prepare: false.
Copiar la URL desde Supabase Connect; usar conexión TLS según configuración del driver.
Las migraciones deben ejecutarse una vez, con conexión adecuada y después de revisar SQL.

## 2. Google Cloud (una vez)

Requiere proyecto con facturación, permisos de despliegue y Google Cloud CLI autenticado.
Puede utilizarse el proyecto Google Cloud asociado al proyecto Firebase existente.

    gcloud auth login
    gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com --project TU_PROJECT_ID

Configurar una cuenta de servicio de ejecución dedicada. En Secret Manager crear
quadra-database-url con DATABASE_URL. Otorgar a esa cuenta
roles/secretmanager.secretAccessor sobre ese secreto.
El usuario de despliegue y la cuenta de Cloud Build también necesitan los permisos
de despliegue/build indicados por Google Cloud; resolverlos antes de la ventana de entrega.
No pasar contraseñas en comandos que queden en el historial; usar la consola de Secret Manager.

Copiar cloud-run/env.example.yaml a cloud-run/env.local.yaml y completar.
Los nombres deben coincidir con los que lee el backend real.
Si requiere service_role, crear otro secreto y agregar su referencia en --set-secrets
del script. No incorporarlo al frontend ni al archivo público de ejemplo.

## 3. Vercel: reservar URL

Importar el repositorio GitHub en Vercel con:

| Ajuste | Valor |
| --- | --- |
| Root Directory | frontend |
| Framework | Vite |
| Node.js | 22.x |
| Install Command | npm install (npm ci cuando se versione el lockfile) |
| Build Command | npm run build |
| Output Directory | dist |

Reservar/copiar dominio de producción y ponerlo en FRONTEND_ORIGINS.
frontend/vercel.json permite recargar rutas internas de React Router.
No hace proxy de /api: VITE_API_URL apunta directamente al backend HTTPS.
Mientras falte la API, no usar el login como evidencia de integración terminada.

## 4. Desplegar backend

Definir variables locales sin credenciales secretas:

    export GCP_PROJECT_ID=tu-proyecto
    export GCP_REGION=us-central1
    export BACKEND_DIR=/ruta/absoluta/al/backend
    export RUNTIME_SERVICE_ACCOUNT=quadra-api@tu-proyecto.iam.gserviceaccount.com
    export DATABASE_SECRET_VERSION=quadra-database-url:1
    export ENV_FILE=/ruta/absoluta/a/deploy/cloud-run/env.local.yaml
    bash deploy/cloud-run/deploy.sh

Elegir región cercana a Supabase; us-central1 es solo el valor inicial.
El script construye remotamente y publica el backend; no ejecutarlo hasta completar
el guard de autenticación, las variables y la cuenta de servicio.
Límites iniciales: 512 MiB, 2 instancias máximo, 20 requests concurrentes.
No garantizan un límite de gasto; configurar alertas de presupuesto.
min-instances=0 puede implicar arranque en frío. Para la demo puede establecerse 1
temporalmente, con su costo correspondiente, y volver a 0 al terminar.

## 5. Completar frontend

En Vercel > Settings > Environment Variables (Production y Preview según corresponda):

| Variable | Valor |
| --- | --- |
| VITE_API_URL | https://URL-REAL-CLOUD-RUN/api |
| VITE_SUPABASE_URL | URL del proyecto Supabase |
| VITE_SUPABASE_ANON_KEY | Clave pública anon/publishable |

Después de guardar, ejecutar un redeploy; Vite incorpora variables durante el build.
No definir DATABASE_URL ni service_role en Vercel para este frontend estático.
En Supabase Auth > URL Configuration, poner el dominio frontend como Site URL.
Agregar redirect URLs exactas si se usan recuperación de contraseña, magic links u OAuth.

## 6. Prueba de entrega

- GET URL-BACKEND/api/health devuelve 200.
- Endpoint privado sin JWT devuelve 401; JWT inválido también.
- Login real desde Vercel y una consulta autenticada funcionan.
- Verificar preflight OPTIONS y que un origen no permitido no recibe permiso CORS.
- Recargar /cargas directamente: React carga sin 404.
- Validar carga → hallazgos → consolidación con datos reales.
- Revisar logs de Cloud Run después del flujo completo.

El repositorio aún no tiene backend, credenciales ni proyectos vinculados.
Estas plantillas requieren validación con ese código antes de desplegar.
