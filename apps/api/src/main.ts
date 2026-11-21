import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { createApp } from './app.factory';
import { loadConfig } from './config/app-config';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const app = await createApp(config);
  await app.listen(config.port, '0.0.0.0');
  const logger = new Logger('Quadra API');
  logger.log(`Escuchando en 0.0.0.0:${config.port} (prefijo /api)`);
  if (config.auth.mode === 'unconfigured') logger.warn('Sin SUPABASE_JWKS_URL: toda ruta de negocio responde 401.');
  if (!config.databaseUrl) logger.warn('Sin DATABASE_URL: las rutas de negocio con token válido responden 503.');
}

void bootstrap();
