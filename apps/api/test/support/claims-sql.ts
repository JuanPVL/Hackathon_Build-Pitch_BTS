import postgres from 'postgres';
import { testDatabaseUrl } from './env';

/**
 * Ejecuta SQL "como lo vería el usuario en el SQL Editor con su JWT": claims + SET LOCAL ROLE
 * authenticated, por una conexión independiente del API. Sirve de referencia para comparar.
 */
export async function asUser<T extends readonly object[]>(
  userId: string,
  query: (sql: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  const sql = postgres(testDatabaseUrl(), { max: 1 });
  try {
    return (await sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: 'authenticated' })}, true)`;
      await tx`set local role authenticated`;
      return query(tx);
    })) as T;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function asOwner<T extends readonly object[]>(query: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(testDatabaseUrl(), { max: 1 });
  try {
    return await query(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}
