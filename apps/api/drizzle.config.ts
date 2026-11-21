import { defineConfig } from 'drizzle-kit';

// Solo introspección (`npm run db:pull`). Los scripts SQL numerados de
// hackathon-consolidacion/supabase/ son la fuente de verdad del esquema:
// NO usar `drizzle-kit push`, `generate` ni `migrate` contra esta base.
// Hoy el pull se hace contra el PostgreSQL LOCAL con 01..05 cargados (npm run db:local).
const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('Define DATABASE_URL para hacer el pull (en local: la base creada por npm run db:local).');
}

export default defineConfig({
  dialect: 'postgresql',
  out: './src/db/schema',
  dbCredentials: { url },
  schemaFilter: ['public', 'audit', 'authz'],
  introspect: { casing: 'preserve' },
  // Las policies de RLS viven en 05_security_rls.sql; no se duplican en TypeScript.
  entities: { roles: false },
});
