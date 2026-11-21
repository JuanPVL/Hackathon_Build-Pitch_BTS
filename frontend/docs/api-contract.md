# Integración del frontend con NestJS

API: https://quadra-api-348721619034.us-central1.run.app/api
Contrato consultado: /api/openapi.json (19 operaciones).
OpenAPI publica rutas y parámetros; los tipos de respuesta se contrastaron con los
controladores integrados en apps/api. El único adaptador de transporte es
src/shared/api/backend.ts, que envía JWT de Supabase.

| Pantalla / acción | Recursos reales |
| --- | --- |
| Acceso y permisos | GET /me |
| Empresas | GET /companies |
| Cargas y hallazgos | GET /loads?scenarioId, GET /scenarios/:scenarioId/findings |
| Filas de origen | GET /loads/:loadId |
| Consolidado | GET /runs, GET /runs/:runId/consolidated, /kpis, /reconciliation |
| Corrida y parámetros | GET /runs/:runId |
| Nueva consolidación | POST /scenarios/:scenarioId/consolidate |
| Conciliación | GET /runs/:runId/reconciliation |
| Cuenta corriente | GET /runs/:runId/ic-matrix y /reconciliation |
| Eliminaciones | GET /runs/:runId/eliminations, /consolidated, /kpis |
| Rentabilidad | GET /runs/:runId/kpis |
| Desviaciones | GET /bridges, GET /bridges/:bridgeId y /check; KPIs de las dos corridas referenciadas |
| Aceptar documento | POST /ic-documents/:id/accept con {version} |
| Disputar documento | POST /ic-documents/:id/dispute con {version, reason} |
| Salud del servicio | GET /health |

Se selecciona la última corrida del escenario para reportes. Los bridges conservan
sus corridas originales; no se mezclan con nuevas corridas.
Las matrices son vistas actuales de cargas consolidables, tal como indica el backend,
no una foto histórica de la corrida.

Los numeric PostgreSQL se convierten de string a number. NULL se mantiene ausente,
se presenta como raya y no se sustituye por cero.
No se usa acceso directo a tablas ni credenciales administrativas en el navegador.

## Funciones que el contrato aún no expone

- Tabla de tasas y publicación de tasas.
- Carga de nuevos archivos y ejecución del validador.
- Aceptación de correcciones de hallazgos.
- Consulta del documento vigente (versión/estado), historial y linaje completo.
- Tipo y moneda/monto pactado del documento en la respuesta de conciliación.
- Narrativa generada y cálculo de un bridge nuevo.

Esas consultas no llaman rutas propuestas inexistentes. Se muestran límites claros.
El documento presenta conciliación real y permite acciones del receptor cuando tiene
permiso; requiere introducir la versión vigente confirmada, porque no existe GET del
documento. El servidor valida permisos, versión y transición de estado.
Actualizar hallazgos hace GET, no ejecuta el validador.

## Vercel

Root Directory: frontend. Build: npm run build. Output: dist.
.env.production contiene SOLO URL de API, URL Supabase y clave pública publishable
bajo el nombre VITE_SUPABASE_ANON_KEY, que acepta Supabase JS.
Las variables definidas en el panel de Vercel prevalecen: si hay valores antiguos
o vacíos, actualizarlos o eliminarlos y reconstruir.
El cambio entra en producción tras merge y despliegue de la rama de producción.
Nunca poner DATABASE_URL, SUPABASE_SECRET_KEY o service_role en VITE_*.

## Verificación

- TypeScript, build y suites de componentes/contrato.
- Health publicado: 200.
- Preflight desde https://hackathon-build-pitch-bts.vercel.app: 204 y origen permitido.
- La prueba completa con sesión de usuario y mutaciones reales debe realizarse
  después del despliegue, con credenciales introducidas por el usuario.
