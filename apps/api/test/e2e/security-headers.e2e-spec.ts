import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { startApp } from '../support/app';
import { startTestJwks, type TestJwks } from '../support/tokens';

/** QA-H8: las cabeceras de helmet llegan en el servidor e2e y /api/docs carga. */
describe('Cabeceras de seguridad (e2e)', () => {
  let app: NestExpressApplication;
  let jwks: TestJwks;

  beforeAll(async () => {
    jwks = await startTestJwks();
    app = await startApp(jwks);
  });
  afterAll(async () => {
    await app.close();
    await jwks.close();
  });

  it('GET /api/health trae HSTS, nosniff y X-Frame-Options DENY', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['strict-transport-security']).toMatch(/max-age=15552000/);
    expect(res.headers['content-security-policy']).toMatch(/frame-ancestors 'none'/);
  });

  it('GET /api/docs es 200 con Swagger y CSP compatible (unsafe-inline)', async () => {
    const res = await request(app.getHttpServer()).get('/api/docs').redirects(1).expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    const csp = res.headers['content-security-policy'] as string;
    expect(csp).toMatch(/frame-ancestors 'none'/);
    expect(csp).toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(res.text).toMatch(/swagger/i);
  });
});
