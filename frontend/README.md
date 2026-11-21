# Quadra frontend

React + TypeScript + Vite. React Router, TanStack Query y Supabase Auth.
El diseño es provisional; los tokens visuales están en src/styles.css.

## Desarrollo

    cd frontend
    npm install
    cp .env.example .env
    npm run dev

Abrir http://localhost:5173. Configurar URL y clave pública de Supabase.
Vite reenvía /api a http://localhost:3000. El backend debe usar el prefijo /api.
Si usa otra dirección, configurar VITE_API_URL y CORS en NestJS.

## Estructura

- src/auth: sesión y protección de rutas.
- src/lib/api.ts: fetch con JWT vigente, FormData, timeout, cancelación y errores.
- src/components: layout, navegación y catálogo de módulos.
- src/pages: login y base de módulos sin datos ficticios.
- src/styles.css: tokens, estructura adaptable y estilos provisionales.

Los módulos son resumen, cargas, validaciones, intercompany, consolidación y comparativo.
Los endpoints de negocio aún no están conectados: se necesita el contrato OpenAPI del backend.
Crear servicios por funcionalidad usando api<T> y hooks de TanStack Query.
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

- Integrar diseño de pen.dev.
- Confirmar rutas y respuestas de NestJS; conectar servicios y estados loading/error/empty.
- Configurar Supabase y usuario de prueba.
- Definir servidor/dominio y publicar imagen backend.
- Ejecutar prueba completa login → carga → validación → consolidación.
- Verificar HTTPS y recarga directa en rutas internas.

Esta base no incluye endpoints inventados ni resultados simulados.
