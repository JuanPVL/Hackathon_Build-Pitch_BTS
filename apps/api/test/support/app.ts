import type { NestExpressApplication } from '@nestjs/platform-express';
import { createApp } from '../../src/app.factory';
import type { AppConfig } from '../../src/config/app-config';
import { testDatabaseUrl } from './env';
import type { TestJwks } from './tokens';

export const ALLOWED_ORIGIN = 'http://localhost:5173';

export function e2eConfig(jwks: TestJwks): AppConfig {
  return {
    port: 0,
    corsOrigins: [ALLOWED_ORIGIN],
    databaseUrl: testDatabaseUrl(),
    auth: { mode: 'jwks', jwksUrl: jwks.url, issuer: jwks.issuer },
  };
}

export async function startApp(jwks: TestJwks): Promise<NestExpressApplication> {
  const app = await createApp(e2eConfig(jwks), { logger: false });
  await app.init();
  return app;
}
