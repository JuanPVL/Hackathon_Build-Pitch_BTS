# Quadra API (`apps/api`)

Nest.js + Drizzle + Supabase Auth sobre el Postgres de Supabase con RLS. Las reglas de negocio
(estados, triggers, RLS, funciones del motor) viven en los scripts SQL de
`hackathon-consolidacion/supabase/`; el API verifica el JWT, abre una transacción con los claims
del usuario y llama a tablas, vistas y funciones SQL. No reimplementa esa lógica.

## Arranque

```bash
cd apps/api
npm ci
cp .env.example .env     # rellenar desde el canal privado; .env está en .gitignore
set -a && . ./.env && set +a  # o exportar las variables a mano
npm run build && npm run start      # escucha en 0.0.0.0:$PORT (8080 por defecto), rutas bajo /api
curl localhost:8080/api/health      # {"status":"ok","service":"quadra-api"}
```

Variables del `.env.example` (todas vacías): `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_SECRET_KEY` (solo servidor; el API aún no la usa), `SUPABASE_JWKS_URL`, `DATABASE_URL` y
`ANTHROPIC_API_KEY` y `CORS_ORIGIN` (lista de orígenes exactos separados por coma, por ejemplo
`http://localhost:5173,https://front.dominio`). `PORT` (por defecto 8080) lo inyecta Cloud Run. En desarrollo,
`CORS_ORIGIN` vacío permite los localhost comunes (5173, 4173, 3000, 3001). En producción (`NODE_ENV=production`)
la variable es obligatoria y no admite `*` ni quedar vacía: la app no arranca. Toda ruta de negocio exige un JWT
verificado y pasa por RLS.

Con el `.env.example` vacío, el API arranca y responde el healthcheck. Las rutas de negocio
responden 401 si no hay verificador de JWT y 503 si no hay `DATABASE_URL`.

El `Dockerfile` (multi-stage, `node:20-slim`) y el `.dockerignore` están listos para Cloud Run; los pasos de despliegue
están en [DEPLOY.md](DEPLOY.md). En esta rama no se despliega nada.

## Autenticación y base de datos

- **JWT:** se valida solo con el JWKS del proyecto (`SUPABASE_JWKS_URL`, signing keys ES256/RS256, con
  `jose.createRemoteJWKSet` y caché de 10 min), según la decisión del 21 nov 2026. HS256 no se acepta. Se exige `aud=authenticated`, `role=authenticated`, `exp` y un `sub` UUID; si `SUPABASE_URL` está
  definido, también el emisor. Los tokens `anon` y `service_role` se rechazan con 401.
- **Roles:** salen de `"userCompanyAccess"` y de `authz."hasPermission"`, no del JWT. Un token válido sin
  filas de acceso recibe 403 en las rutas de negocio.
- **Cliente de usuario (`src/db/user-db.ts`):** es el único que atiende requests. Por cada operación hace
  `set_config('request.jwt.claims', <claims>, true)` + `SET LOCAL ROLE authenticated` dentro de una
  transacción, así que RLS y `audit."currentUserId"()` ven al usuario real. Usa el puerto 5432 (session pooler
  o directo); si la URL usa 6543 se apagan los prepared statements.
- **Cliente migrador (`src/db/migrator-client.ts`):** cliente privilegiado sin claims (salta RLS); recibe la URL
  explícita y hoy solo lo usan los fixtures de prueba. Nest no lo registra y
  ningún controlador lo importa (`test/unit/architecture.spec.ts`).
- **Esquema Drizzle:** `DATABASE_URL=<base local> npm run db:pull` introspecciona `public`,
  `audit` y `authz` con `casing: "preserve"`. `scripts/post-pull.mjs` corrige defectos conocidos de
  drizzle-kit 0.31 y quita las policies y relations generadas. **No** se usa `drizzle-kit push`, `generate` ni
  `migrate`: el DDL son los scripts SQL numerados.

## Rutas

| Método y ruta | Qué hace | Acceso |
|---|---|---|
| `GET /api/health` | Healthcheck | Público |
| `GET /api/me` | `sub`, `currentUserId()` en la base, accesos y permisos | JWT (sin grants requeridos) |
| `GET /api/companies` | Catálogo de empresas | JWT (sin grants requeridos) |
| `GET /api/loads[?scenarioId=&companyId=]` | Cargas visibles (RLS) | JWT + algún grant |
| `GET /api/loads/:loadId` | Carga con sus líneas (404 si RLS no la deja ver) | JWT + algún grant |
| `GET /api/scenarios/:scenarioId/findings` | Hallazgos visibles (los de `"loadId"` null solo con `readAll`) | JWT + algún grant |
| `GET /api/runs` | Corridas de consolidación | `readAll` |
| `GET /api/runs/:runId/kpis` | `{ run, group: "vGroupKpi", companies: "vCompanyKpi" }` | `readAll` |
| `POST /api/scenarios/:scenarioId/consolidate` | QB-14: `"fnConsolidar"` crea una corrida NUEVA (solo cargas APROBADA) → `{ run, reconciliation }`; 409 sin cargas aprobadas, 404 escenario inexistente | `writeAll` |
| `GET /api/runs/:runId` | `{ run, loads }` (parámetros congelados, `ratesHash`, `lineageOk`, cargas incluidas) | `readAll` |
| `GET /api/runs/:runId/consolidated` | `{ run, accounts }` agregado + eliminaciones + CTA = consolidado | `readAll` |
| `GET /api/runs/:runId/eliminations` | `{ run, eliminations }` E1–E4 y E7 | `readAll` |
| `GET /api/runs/:runId/reconciliation` | QB-13: `{ run, summary, reconciliation }` por documento IC | `readAll` |
| `GET /api/runs/:runId/ic-matrix` | QB-13: `{ billed: "vIcBilledMatrix", balances: "vIcBalanceMatrix" }` del escenario de la corrida | `readAll` |
| `GET /api/bridges` | Bridges V1→V2 | `readAll` |
| `GET /api/bridges/:bridgeId` | Bridge con `lines` (Δ ventas/EBIT) y `eva` (Δ EVA) | `readAll` |
| `GET /api/bridges/:bridgeId/check` | `"vVarianceBridgeCheck"` (cuadre ±1 USD) | `readAll` |
| `POST /api/ic-documents/:id/accept` `{version}` | `"fnAcceptIcDocument"` | Escritura sobre la empresa receptora |
| `POST /api/ic-documents/:id/dispute` `{version, reason}` | `"fnDisputeIcDocument"` | Escritura sobre la empresa receptora |

Errores de las funciones SQL: `insufficient_privilege` → 403, `check_violation` (estado ilegal) → 409.

## Motor de consolidación (QB-13 / QB-14)

Funciones SQL en `hackathon-consolidacion/supabase/07_motor_conciliar_consolidar.sql` (`fnRunLineUsd`,
`fnConciliar`, `fnConsolidar`, security invoker). **No está aplicado a la base en vivo**: aplicarlo es
decisión de Aroldo. Las pruebas locales lo cargan después de 01–05.

- Cada consolidación crea una corrida nueva e inmutable; nunca borra ni modifica corridas previas
  (las del seed 06 incluidas: `test/local-db/check-coexistence-06.sh` lo comprueba en una base local aparte).
- Redondeo: cada línea se convierte y redondea a centavos (`round(amount * rate, 2)`, igual que `vLineUsd`);
  agregados, eliminaciones, CTA y linaje usan esos centavos, así Σ linaje = consolidado al centavo. El oráculo
  Python no redondea: la diferencia por cuenta contra `resultados_referencia/v2_*` es ≤ 0.17 USD. Los estados
  de conciliación se deciden con el USD sin redondear, como el oráculo.
- `fnConciliar` no tiene endpoint propio (PENDIENTE DECISIÓN AROLDO): corre dentro de `fnConsolidar`.

## Pruebas

```bash
npm run test:unit                        # sin base
# e2e: PostgreSQL LOCAL (nunca Supabase). El script rechaza hosts no locales.
export TEST_DATABASE_URL=postgres://postgres@127.0.0.1:54329/quadra_test
npm test                                 # unit + e2e; recrea la base de prueba en cada corrida
```

`test/local-db/setup-local-db.sh` crea la base y carga `00_supabase_stubs.sql`: roles `anon`, `authenticated`
y `service_role`, `auth.users`, `auth.uid()` y los privilegios por defecto que Supabase da en `public`. Después
carga `01`–`05`. **Nunca carga el `06`.** Los stubs son solo para desarrollo y pruebas; no son una migración
del producto. Los fixtures e2e crean usuarios de prueba (controller, auditor, contador y viewer de GT1,
contador de MX1 y un usuario sin acceso), hallazgos, documentos IC y una corrida mínima. Los JWT de prueba son ES256
firmados con un par de claves efímero, publicado por un JWKS local en 127.0.0.1 en cada corrida.
