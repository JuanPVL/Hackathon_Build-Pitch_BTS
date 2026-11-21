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

/** Opciones de postgres.js: con el pooler en modo transacción (6543) no hay prepared statements. */
export function connectionOptions(url: string): postgres.Options<Record<string, never>> {
  const port = new URL(url).port;
  return { max: 10, prepare: port !== '6543' };
}

/**
 * Cliente de USUARIO: el único que atiende requests HTTP.
 * Cada operación corre en una transacción que primero fija los claims del JWT verificado
 * (`request.jwt.claims`, local a la transacción) y baja a `authenticated` con SET LOCAL ROLE,
 * de modo que RLS y audit."currentUserId"() ven a la persona real.
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
      await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify(user.claims)}, true)`);
      await tx.execute(sql`set local role authenticated`);
      return work(tx);
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.client?.end({ timeout: 5 });
  }
}
