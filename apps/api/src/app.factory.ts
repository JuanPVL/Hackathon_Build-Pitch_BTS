import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
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
  setupOpenApi(app);
}

/** Swagger UI en /api/docs y el documento en /api/openapi.json. Ambos son públicos. */
export function setupOpenApi(app: INestApplication): void {
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Quadra API')
    .setDescription(
      'API de consolidación presupuestaria Quadra. Las rutas de negocio exigen un access token de Supabase Auth en `Authorization: Bearer`.',
    )
    .setVersion('0.1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Access token de Supabase Auth (Authorization: Bearer <jwt>)',
      },
      'bearer',
    )
    .addSecurityRequirements('bearer')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    useGlobalPrefix: true,
    jsonDocumentUrl: 'openapi.json',
  });
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
