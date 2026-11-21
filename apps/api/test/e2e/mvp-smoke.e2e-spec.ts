/** Smoke del MVP de lectura: empresas, corridas, KPIs y bridge con JWT de un JWKS local. */
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { startApp } from '../support/app';
import { asOwner } from '../support/claims-sql';
import { USERS, type UserKey } from '../support/fixtures';
import { startTestJwks, type TestJwks } from '../support/tokens';

describe('Smoke MVP de lectura', () => {
  let app: NestExpressApplication;
  let jwks: TestJwks;
  let bridgeId: string;

  const get = async (user: UserKey, path: string, expected: number) =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${await jwks.sign(USERS[user].id)}`).expect(expected);

  beforeAll(async () => {
    jwks = await startTestJwks();
    app = await startApp(jwks);
    const [b] = await asOwner((sql) => sql<{ bridgeId: string }[]>`select "bridgeId" from "varianceBridge" limit 1`);
    bridgeId = b.bridgeId;
  });
  afterAll(async () => {
    await app.close();
    await jwks.close();
  });

  it('GET /api/companies: las 6 empresas para cualquier autenticado; 401 sin token', async () => {
    expect((await get('noGrant', '/api/companies', 200)).body).toHaveLength(6);
    expect((await get('gt1Accountant', '/api/companies', 200)).body.map((c: { companyId: string }) => c.companyId)).toContain('GT1');
    await request(app.getHttpServer()).get('/api/companies').expect(401);
  });

  it('GET /api/runs y /api/runs/:runId/kpis (group + companies) para readAll; 403 para una empresa', async () => {
    const runs = (await get('controller', '/api/runs', 200)).body;
    // >= 2: las corridas fixture; el motor (motor.e2e-spec) puede haber creado más.
    expect(runs.length).toBeGreaterThanOrEqual(2);
    const kpis = (await get('auditor', `/api/runs/${runs[runs.length - 1].runId}/kpis`, 200)).body;
    expect(kpis).toHaveProperty('group');
    expect(kpis).toHaveProperty('companies');
    await get('gt1Accountant', '/api/runs', 403);
  });

  it('GET /api/bridges, /:bridgeId y /:bridgeId/check para readAll; 403 / 404 / 401', async () => {
    const list = (await get('auditor', '/api/bridges', 200)).body;
    expect(list.map((b: { bridgeId: string }) => b.bridgeId)).toEqual([bridgeId]);
    const one = (await get('controller', `/api/bridges/${bridgeId}`, 200)).body;
    expect(one).toMatchObject({ bridgeId, lines: [], eva: [] });
    const check = (await get('controller', `/api/bridges/${bridgeId}/check`, 200)).body;
    expect(check.bridgeId).toBe(bridgeId);
    await get('gt1Accountant', `/api/bridges/${bridgeId}`, 403);
    await get('controller', '/api/bridges/00000000-0000-4000-8000-0000000000cc', 404);
    await request(app.getHttpServer()).get('/api/bridges').expect(401);
  });
});
