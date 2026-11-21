# QUADRA · frontend

React 19 + TypeScript + Vite. React Router, TanStack Query y Supabase Auth.
Diseño: [docs/design-system.md](docs/design-system.md) (kit de marca QUADRA, mockups de pen.dev).
Contrato que el frontend espera de NestJS: [docs/api-contract.md](docs/api-contract.md) (**propuesta**, pendiente de confirmar).

## Desarrollo

    cd frontend
    npm ci
    cp .env.example .env
    npm run dev        # http://localhost:5173
    npm test           # vitest
    npm run typecheck
    npm run build

Vite reenvía /api a http://localhost:3000. El backend debe usar el prefijo /api.
Si usa otra dirección, configurar VITE_API_URL y CORS en NestJS.

Sin VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY, **solo en `npm run dev`** las rutas se abren sin sesión
(aviso "Modo desarrollo") para revisar el diseño; las pantallas muestran estados vacíos o de error porque
no hay backend. En un build de producción se exige la configuración.

## Estructura (feature-sliced + puertos y adaptadores)

```
src/
├─ main.tsx              entrada: tema + proveedores + rutas
├─ app/                  providers.tsx, router.tsx (rutas lazy), LoginPage
│  └─ di/                raíz de composición: elige la implementación de cada puerto
├─ layout/               AppShell: barra lateral (≥1024), riel (768–1023), barra inferior (<768);
│                        navigation.ts es la única fuente de rutas y pasos
├─ entities/             tipos de dominio compartidos (empresas, monedas, escenario)
├─ shared/
│  ├─ api/               HttpClient (JWT, timeout, ApiError)
│  ├─ auth/              Supabase Auth, AuthProvider, ProtectedRoute
│  ├─ config/env.ts      única lectura de VITE_*
│  ├─ theme/             tokens.css (paleta QUADRA), base.css, tipografías locales
│  ├─ ui/                componentes de la marca y estados (QueryState)
│  ├─ format/            formateo de montos, %, signos
│  └─ hooks/             useScenarioContext (versión en la URL)
└─ features/<módulo>/    domain/ (tipos y reglas puras) · ports/ (interfaz) · adapters/ (HTTP)
                         hooks/ (TanStack Query) · ui/ · <Módulo>Page.tsx
```

Módulos: consolidation (`/`), validation (`/validacion`), reconciliation (`/conciliacion`),
current-account (`/cuenta-corriente`), ic-document (`/documentos/:key`), rates (`/tasas`),
eliminations (`/eliminaciones`), profitability (`/rentabilidad`), variance (`/desviaciones`).

### Reglas de dependencia (SOLID)

- Las páginas componen; los hooks piden datos al **puerto** con `useRepository('<módulo>')`; los
  adaptadores HTTP implementan el puerto. Nadie fuera de `app/di` conoce `Http*Repository`.
- `shared/` no importa de `features/` ni de `layout/`. Un módulo no importa la UI de otro (solo tipos).
- Agregar un módulo: crear `features/<x>/`, registrar su puerto en `app/di/repositories.ts`, su ruta en
  `app/router.tsx` y su entrada en `layout/navigation.ts`.
- Pruebas: `src/test/renderWithProviders.tsx` inyecta dobles de los puertos sin tocar las páginas.

El backend debe validar firma, audiencia y expiración del JWT de Supabase, además de los permisos.
La protección de rutas del navegador no reemplaza autorización del servidor.
No usar Drizzle ni acceso directo a tablas desde el navegador.

La instalación inicial genera package-lock.json; versionarlo al completar la instalación.
Después usar npm ci para instalaciones reproducibles.

## Verificación

    npm run typecheck
    npm run build

## Despliegue principal: Vercel + Cloud Run

Ver [guía de despliegue](../deploy/README.md). Vercel usa frontend como Root Directory
y las variables de .env.production.example. El backend se publica por separado en Cloud Run.

## Alternativa: publicación en servidor

La raíz contiene compose.yaml para frontend + imagen del backend.
Se necesita Docker Compose, servidor y una imagen NestJS ya construida y accesible.

1. Copiar .env.example de la raíz a .env y completar claves públicas e imagen.
2. Crear .env.backend en la raíz con los secretos del backend; no versionarlo.
3. NestJS debe escuchar 0.0.0.0:3000 y exponer /api.
4. Ejecutar desde la raíz:

       docker compose up -d --build
       docker compose ps
       curl -f http://localhost/healthz

Nginx publica React y reenvía /api al contenedor backend. El backend no expone puerto público.
Probar también una ruta real /api y un inicio de sesión antes de la entrega.
Para HTTPS usar el proxy/TLS del proveedor o un reverse proxy en el servidor.
No desplegar la autenticación públicamente sin HTTPS.

Alternativa: publicar dist en hosting estático con fallback a index.html y
VITE_API_URL apuntando a la URL HTTPS del backend. Configurar CORS con el origen exacto.
Las variables VITE_* se incorporan al build; al cambiarlas hay que reconstruir.
No poner secretos, DATABASE_URL ni service_role en variables VITE_*.

## Pendientes para entrega 14:00 (Guatemala)

- ~~Integrar diseño de pen.dev.~~ Hecho: 9 pantallas, responsive 390/768/1440.
- Confirmar con NestJS las rutas y respuestas de docs/api-contract.md (los adaptadores HTTP y los
  estados loading/error/empty ya están; solo cambian las rutas si NestJS define otras).
- Configurar Supabase y usuario de prueba.
- Definir servidor/dominio y publicar imagen backend.
- Ejecutar prueba completa login → carga → validación → consolidación.
- Verificar HTTPS y recarga directa en rutas internas.

No hay resultados simulados en el código de producción: los datos de ejemplo viven solo en las pruebas.
Las rutas de los adaptadores son una propuesta documentada en docs/api-contract.md, no endpoints existentes.
