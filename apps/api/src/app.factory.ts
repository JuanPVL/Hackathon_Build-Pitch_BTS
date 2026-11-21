import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import type { AppConfig } from './config/app-config';

/** El front (nginx) reenvía /api/* al backend: todas las rutas cuelgan de /api. */
export function configureApp(app: INestApplication, config: AppConfig): void {
  app.setGlobalPrefix('api');
  // Allowlist exacta de CORS_ORIGIN. El front manda Bearer JWT, no cookies: sin credentials.
  app.enableCors({
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    credentials: false,
  });
  app.enableShutdownHooks();
}

export async function createApp(
  config: AppConfig,
  options: { logger?: false } = {},
): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forConfig(config), {
    logger: options.logger ?? ['error', 'warn', 'log'],
  });
  app.disable('x-powered-by');
  configureApp(app, config);
  return app;
}
