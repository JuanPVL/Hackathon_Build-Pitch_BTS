import type { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import type { AppConfig } from './config/app-config';

/** El front (nginx) reenvía /api/* al backend: todas las rutas cuelgan de /api. */
export function configureApp(app: INestApplication, config: AppConfig): void {
  app.setGlobalPrefix('api');
  app.use(securityHeaders);
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

const HSTS_MAX_AGE_SECONDS = 15552000; // 180 días

function isDocsPath(path: string): boolean {
  return path === '/api/docs' || path.startsWith('/api/docs/') || path === '/api/openapi.json';
}

/**
 * Cabeceras de seguridad (QA-H8): HSTS, nosniff, X-Frame-Options DENY y CSP con frame-ancestors 'none'.
 * En /api/docs y sus assets la CSP permite los inline scripts/styles que necesita Swagger UI.
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  const docs = isDocsPath(req.path);
  helmet({
    xContentTypeOptions: true,
    frameguard: { action: 'deny' },
    hsts: { maxAge: HSTS_MAX_AGE_SECONDS, includeSubDomains: true },
    contentSecurityPolicy: {
      useDefaults: !docs,
      directives: {
        defaultSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        ...(docs
          ? {
              scriptSrc: ["'self'", "'unsafe-inline'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", 'data:', 'https://validator.swagger.io'],
              fontSrc: ["'self'", 'data:'],
              connectSrc: ["'self'"],
            }
          : {}),
      },
    },
  })(req, res, next);
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
