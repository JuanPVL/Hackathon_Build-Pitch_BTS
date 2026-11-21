import request from 'supertest';
import { createApp } from '../../src/app.factory';
import { loadConfig } from '../../src/config/app-config';

/** OpenAPI público: /api/docs (Swagger UI) y /api/openapi.json, con bearer documentado. */
describe('OpenAPI', () => {
  it('GET /api/openapi.json y /api/docs responden 200 sin token; el documento declara bearer', async () => {
    const config = loadConfig({ CORS_ORIGIN: 'http://localhost:5173' });
    const app = await createApp(config, { logger: false });
    await app.init();
    try {
      const server = app.getHttpServer();
      const spec = await request(server).get('/api/openapi.json').expect(200);
      expect(spec.body.openapi).toMatch(/^3\./);
      expect(spec.body.paths['/api/health'] ?? spec.body.paths['/health']).toBeDefined();
      const schemes = spec.body.components?.securitySchemes ?? {};
      expect(schemes.bearer).toMatchObject({ type: 'http', scheme: 'bearer' });
      const health = (spec.body.paths['/api/health'] ?? spec.body.paths['/health']).get;
      expect(health.security).toEqual([]);

      const ui = await request(server).get('/api/docs').redirects(1).expect(200);
      expect(ui.text).toMatch(/swagger/i);
    } finally {
      await app.close();
    }
  });
});
