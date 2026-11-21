/** URL de la base LOCAL de pruebas. Nunca la de Supabase: el script de setup rechaza hosts no locales. */
export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'Las pruebas e2e necesitan TEST_DATABASE_URL apuntando a un PostgreSQL local, p. ej. ' +
        'postgres://postgres@127.0.0.1:54329/quadra_test (ver apps/api/README.md). Solo unitarias: npm run test:unit',
    );
  }
  return url;
}
