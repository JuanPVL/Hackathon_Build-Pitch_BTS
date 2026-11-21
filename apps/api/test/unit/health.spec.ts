import { join } from 'node:path';
import request from 'supertest';
import { createApp } from '../../src/app.factory';
import { loadConfig } from '../../src/config/app-config';
import { parseEnvFile } from './config.spec';

/** QB-02 criterio 1 y 4: con solo el .env.example, healthcheck 200 sin JWT y negocio 401. */
describe('Arranque con el .env.example', () => {
  it('GET /api/health → 200; rutas de negocio → 401', async () => {
    const config = loadConfig(parseEnvFile(join(__dirname, '../../.env.example')) as NodeJS.ProcessEnv);
    const app = await createApp(config, { logger: false });
    await app.init();
    try {
      await request(app.getHttpServer()).get('/api/health').expect(200, { status: 'ok', service: 'quadra-api' });
      await request(app.getHttpServer()).get('/api/loads').expect(401);
      await request(app.getHttpServer()).get('/api/loads').set('Authorization', 'Bearer abc.def.ghi').expect(401);
    } finally {
      await app.close();
    }
  });
});
