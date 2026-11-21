import { Inject, Injectable, OnApplicationShutdown, ServiceUnavailableException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import type { VerifiedUser } from '../auth/jwt-verifier';
import * as schema from './schema/schema';


const fullSchema = { ...schema };
export type QuadraDb = PostgresJsDatabase<typeof fullSchema>;
export type UserTx = Parameters<Parameters<QuadraDb['transaction']>[0]>[0];

function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

/** Opciones de postgres.js: pool pequeño, TLS validado hacia el pooler, y sin prepared statements en el puerto 6543. */
export function connectionOptions(url: string): postgres.Options<Record<string, never>> {
  const parsed = new URL(url);
  const port = parsed.port;
  return {
    max: 5,
    prepare: port !== '6543',
    // Local de pruebas queda sin TLS; el pooler de Supabase (y cualquier host remoto) exige certificado válido.
    ssl: isLocalHost(parsed.hostname) ? false : { rejectUnauthorized: true },
  };
}

/**
 * Cliente de USUARIO: el único que atiende requests HTTP.
 * Cada operación corre en una transacción que primero fija los claims del JWT verificado
 * (`request.jwt.claim.sub` y `request.jwt.claims`, local a la transacción) y baja a `authenticated`
 * con SET LOCAL ROLE, de modo que RLS y audit."currentUserId"() ven a la persona real.
 * Conexión recomendada: session pooler o directa (5432).
 */
@Injectable()
export class UserDb implements OnApplicationShutdown {
  private readonly client?: postgres.Sql;
  private readonly db?: QuadraDb;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    if (config.databaseUrl) {
      this.client = postgres(config.databaseUrl, connectionOptions(config.databaseUrl));
      this.db = drizzle(this.client, { schema: fullSchema });
    }
  }

  async run<T>(user: VerifiedUser, work: (tx: UserTx) => Promise<T>): Promise<T> {
    if (!this.db) throw new ServiceUnavailableException('Base de datos no configurada');
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('request.jwt.claim.sub', ${user.userId}, true)`);
      await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify(user.claims)}, true)`);
      await tx.execute(sql`set local role authenticated`);
      return work(tx);
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.client?.end({ timeout: 5 });
  }
}
