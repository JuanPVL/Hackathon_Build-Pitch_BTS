import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { connectionOptions, type QuadraDb } from './user-db';
import * as schema from './schema/schema';


/**
 * Cliente MIGRADOR / privilegiado (owner o service_role): se salta RLS y deja
 * audit."currentUserId"() en null. SOLO para scripts de servidor y pruebas
 * (checklist de la base, fixtures). No se registra en el módulo de Nest y ningún
 * controlador lo importa (lo comprueba test/unit/architecture.spec.ts).
 */
export function createMigratorClient(url: string): {
  db: QuadraDb;
  sql: postgres.Sql;
  close: () => Promise<void>;
} {
  const client = postgres(url, { ...connectionOptions(url), max: 2 });
  return {
    db: drizzle(client, { schema: { ...schema } }),
    sql: client,
    close: () => client.end({ timeout: 5 }),
  };
}
