import { createApp } from '../../src/app.factory';
import { loadConfig } from '../../src/config/app-config';
import request from 'supertest';

/** QA-H1: preflight con allowlist exacta (origen permitido vs rechazado). */
describe('CORS allowlist exacta', () => {
  it('refleja un origen de la lista y no uno ajeno; en producción no arranca con "*"', async () => {
    expect(() => loadConfig({ NODE_ENV: 'production', CORS_ORIGIN: '*' })).toThrow(/En producción CORS_ORIGIN/);

    const config = loadConfig({
      CORS_ORIGIN: 'http://localhost:5173,https://front.dominio',
    });
    const app = await createApp(config, { logger: false });
    await app.init();
    try {
      const server = app.getHttpServer();
      const allowed = await request(server)
        .options('/api/health')
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'GET');
      expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');

      const alsoAllowed = await request(server)
        .options('/api/health')
        .set('Origin', 'https://front.dominio')
        .set('Access-Control-Request-Method', 'GET');
      expect(alsoAllowed.headers['access-control-allow-origin']).toBe('https://front.dominio');

      const rejected = await request(server)
        .options('/api/health')
        .set('Origin', 'https://evil.example')
        .set('Access-Control-Request-Method', 'GET');
      expect(rejected.headers['access-control-allow-origin']).toBeUndefined();
    } finally {
      await app.close();
    }
  });
});
