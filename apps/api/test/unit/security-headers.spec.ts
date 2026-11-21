import request from 'supertest';
import { createApp } from '../../src/app.factory';
import { loadConfig } from '../../src/config/app-config';

/** QA-H8: HSTS, nosniff, X-Frame-Options/frame-ancestors; /api/docs sigue sirviendo Swagger UI. */
describe('Cabeceras de seguridad', () => {
  it('GET /api/health y /api/docs exponen HSTS, nosniff y anti-frame; docs carga Swagger', async () => {
    const config = loadConfig({ CORS_ORIGIN: 'http://localhost:5173' });
    const app = await createApp(config, { logger: false });
    await app.init();
    try {
      const server = app.getHttpServer();
      const health = await request(server).get('/api/health').expect(200);
      expect(health.headers['x-content-type-options']).toBe('nosniff');
      expect(health.headers['x-frame-options']).toBe('DENY');
      expect(health.headers['strict-transport-security']).toMatch(/max-age=15552000/);
      expect(health.headers['content-security-policy']).toMatch(/frame-ancestors 'none'/);

      const docs = await request(server).get('/api/docs').redirects(1).expect(200);
      expect(docs.headers['x-content-type-options']).toBe('nosniff');
      expect(docs.headers['x-frame-options']).toBe('DENY');
      expect(docs.headers['strict-transport-security']).toMatch(/max-age=15552000/);
      const csp = docs.headers['content-security-policy'] as string;
      expect(csp).toMatch(/frame-ancestors 'none'/);
      expect(csp).toMatch(/script-src[^;]*'unsafe-inline'/);
      expect(csp).toMatch(/style-src[^;]*'unsafe-inline'/);
      expect(docs.text).toMatch(/swagger/i);
    } finally {
      await app.close();
    }
  });
});
