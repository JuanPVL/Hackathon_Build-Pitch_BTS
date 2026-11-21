/**
 * QB-02 (criterio 4) y QB-03 (criterios 2, 3, 4 y 5): 401 antes de abrir transacción,
 * claims + SET LOCAL ROLE authenticated, aislamiento RLS sin grants y 403 en el guard.
 */
import type { NestExpressApplication } from '@nestjs/platform-express';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { UserDb } from '../../src/db/user-db';
import { startApp } from '../support/app';
import { asUser } from '../support/claims-sql';
import { USERS } from '../support/fixtures';
import { startTestJwks, type TestJwks } from '../support/tokens';

const BUSINESS_ROUTES: Array<['get' | 'post', string]> = [
  ['get', '/api/loads'],
  ['get', '/api/loads/00000000-0000-4000-8000-0000000000aa'],
  ['get', '/api/scenarios/PPTO_V1/findings'],
  ['get', '/api/runs/00000000-0000-4000-8000-0000000000bb/kpis'],
  ['post', '/api/ic-documents/T-GT1-MX1-ACCEPT/accept'],
  ['post', '/api/ic-documents/T-GT1-MX1-ACCEPT/dispute'],
  ['get', '/api/me'],
];

describe('Guard JWT y cliente de usuario con RLS', () => {
  let app: NestExpressApplication;
  let jwks: TestJwks;
  let runSpy: jest.SpyInstance;

  beforeAll(async () => {
    jwks = await startTestJwks();
    app = await startApp(jwks);
    runSpy = jest.spyOn(app.get(UserDb), 'run');
  });
  afterAll(async () => {
    await app.close();
    await jwks.close();
  });
  beforeEach(() => runSpy.mockClear());

  it('el healthcheck responde sin JWT', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', service: 'quadra-api' });
  });

  describe.each(BUSINESS_ROUTES)('%s %s', (method, path) => {
    const call = () => request(app.getHttpServer())[method](path);

    it('sin Authorization → 401 y sin transacción', async () => {
      await call().expect(401);
      expect(runSpy).not.toHaveBeenCalled();
    });

    it.each([
      ['basura', async () => 'no-es-un-jwt'],
      ['firmado con una clave que no está en el JWKS', () => jwks.sign(USERS.controller.id, { key: 'other' })],
      ['HS256 con secreto compartido', () => jwks.sign(USERS.controller.id, { key: 'hs256' })],
      ['expirado', () => jwks.sign(USERS.controller.id, { expiresIn: Math.floor(Date.now() / 1000) - 60 })],
      ['rol anon', () => jwks.sign(USERS.controller.id, { role: 'anon' })],
      ['rol service_role', () => jwks.sign(USERS.controller.id, { role: 'service_role' })],
      ['audiencia distinta', () => jwks.sign(USERS.controller.id, { aud: 'otra' })],
      ['emisor distinto', () => jwks.sign(USERS.controller.id, { issuer: 'https://otro.supabase.co/auth/v1' })],
    ])('token inválido (%s) → 401 y sin transacción', async (_label, makeToken) => {
      await call().set('Authorization', `Bearer ${await makeToken()}`).expect(401);
      expect(runSpy).not.toHaveBeenCalled();
    });
  });

  it('el cliente de usuario fija los claims y baja a authenticated: currentUserId() = sub del JWT', async () => {
    const token = await jwks.sign(USERS.gt1Accountant.id);
    const res = await request(app.getHttpServer()).get('/api/me').set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.body).toMatchObject({
      userId: USERS.gt1Accountant.id,
      dbUserId: USERS.gt1Accountant.id,
      dbRole: 'authenticated',
      grants: [{ companyId: 'GT1', roleCode: 'COMPANY_ACCOUNTANT' }],
      permissions: { readAll: false, writeAll: false, approveLoads: false, masterData: false },
    });
  });

  it('roles leídos de "userCompanyAccess", no del JWT: el controller tiene flags de grupo', async () => {
    const token = await jwks.sign(USERS.controller.id);
    const res = await request(app.getHttpServer()).get('/api/me').set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.body.permissions).toEqual({ readAll: true, writeAll: true, approveLoads: true, masterData: true });
  });

  describe('usuario autenticado sin fila en "userCompanyAccess"', () => {
    it('recibe 403 en rutas de negocio', async () => {
      const token = await jwks.sign(USERS.noGrant.id);
      for (const path of ['/api/loads', '/api/scenarios/PPTO_V1/findings']) {
        await request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`).expect(403);
      }
    });

    it('RLS le devuelve 0 filas de negocio y sí le deja ver catálogos (vía el cliente de usuario)', async () => {
      const db = app.get(UserDb);
      const user = { userId: USERS.noGrant.id, claims: { sub: USERS.noGrant.id, role: 'authenticated' as const } };
      const counts = await db.run(user, async (tx) => {
        const rows = await tx.execute<Record<string, number>>(sql`select (select count(*) from "dataLoad")::int as loads,
                  (select count(*) from "dataLoadLine")::int as lines,
                  (select count(*) from "validationFinding")::int as findings,
                  (select count(*) from "consolidationRun")::int as runs,
                  (select count(*) from "lineage")::int as lineage,
                  (select count(*) from "company")::int as companies`);
        return rows[0];
      });
      expect(counts).toEqual({ loads: 0, lines: 0, findings: 0, runs: 0, lineage: 0, companies: 6 });
    });
  });

  it('referencia: con claims + rol authenticated en SQL directo el mismo usuario tampoco ve cargas', async () => {
    const [row] = await asUser(USERS.noGrant.id, (sql) => sql<{ n: number }[]>`select count(*)::int as n from "dataLoad"`);
    expect(row.n).toBe(0);
  });

  it('CORS: solo el origen de la allowlist recibe Access-Control-Allow-Origin', async () => {
    const ok = await request(app.getHttpServer())
      .options('/api/loads')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'GET');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const other = await request(app.getHttpServer())
      .options('/api/loads')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'GET');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });
});
