/**
 * P0-2: GET /scenarios/:scenarioId/rates — tasas actuales por escenario y periodo.
 */
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { startApp } from '../support/app';
import { asOwner, asUser } from '../support/claims-sql';
import { USERS, type UserKey } from '../support/fixtures';
import { startTestJwks, type TestJwks } from '../support/tokens';

describe('GET /scenarios/:scenarioId/rates (P0-2)', () => {
  let app: NestExpressApplication;
  let jwks: TestJwks;
  let v1RunId: string;
  let v2RunId: string;

  const get = async (user: UserKey | 'anon', path: string, expected: number) => {
    const req = request(app.getHttpServer()).get(path);
    if (user !== 'anon') req.set('Authorization', `Bearer ${await jwks.sign(USERS[user].id)}`);
    return req.expect(expected);
  };

  beforeAll(async () => {
    jwks = await startTestJwks();
    app = await startApp(jwks);
    const runs = await asOwner(
      (sql) => sql<{ runId: string; scenarioId: string }[]>`
        select "runId", "scenarioId" from "consolidationRun" order by "scenarioId"`,
    );
    v1RunId = runs.find((r) => r.scenarioId === 'PPTO_V1')!.runId;
    v2RunId = runs.find((r) => r.scenarioId === 'PPTO_V2')!.runId;
  });
  afterAll(async () => {
    await app.close();
    await jwks.close();
  });

  it('sin token → 401; usuario sin grants → 403; escenario inexistente → 404', async () => {
    await get('anon', '/api/scenarios/PPTO_V1/rates', 401);
    await get('noGrant', '/api/scenarios/PPTO_V1/rates', 403);
    await get('controller', '/api/scenarios/NO_EXISTE/rates', 404);
  });

  it('periodCode o runId mal formados, o scenarioId inválido → 400', async () => {
    await get('controller', '/api/scenarios/PPTO_V1/rates?periodCode=2027', 400);
    await get('controller', '/api/scenarios/PPTO_V1/rates?periodCode=diciembre', 400);
    await get('controller', '/api/scenarios/PPTO_V1/rates?runId=no-es-uuid', 400);
    await get('controller', "/api/scenarios/x'or'1/rates", 400);
  });

  describe.each(['controller', 'auditor', 'gt1Accountant', 'gt1Viewer'] as const)('%s puede leer las tasas', (user) => {
    it('filtra por periodo y no inventa un agregado anual', async () => {
      const res = await get(user, '/api/scenarios/PPTO_V1/rates?periodCode=2027-12', 200);
      expect(res.body.scenarioId).toBe('PPTO_V1');
      expect(res.body.periodCode).toBe('2027-12');
      expect(res.body.historicalSnapshot).toBe(false);
      expect(res.body.conversionRules).toEqual([]);
      expect(res.body.alerts).toEqual([]);
      expect(res.body.ratesHash).toEqual(expect.any(String));
      expect(res.body.rows.length).toBeGreaterThan(0);
      expect(res.body.rows.every((r: { periodCode: string }) => r.periodCode === '2027-12')).toBe(true);
      const mxn = res.body.rows.find((r: { currencyCode: string; rateTypeCode: string }) => r.currencyCode === 'MXN' && r.rateTypeCode === 'PRESUPUESTO');
      expect(mxn).toBeDefined();
      expect(Number(mxn.usdPerUnit)).toBeCloseTo(0.05555556, 8);
    });
  });

  it('sin periodCode devuelve todas las filas con su periodo, sin agregar', async () => {
    const res = await get('controller', '/api/scenarios/PPTO_V1/rates', 200);
    expect(res.body.periodCode).toBeNull();
    const periods = new Set(res.body.rows.map((r: { periodCode: string }) => r.periodCode));
    expect(periods.size).toBe(12);
    expect(periods.has('2027-01')).toBe(true);
    expect(periods.has('2027-12')).toBe(true);
    const expected = await asUser(USERS.controller.id, (sql) => sql<{ n: number }[]>`
      select count(*)::int as n from "groupExchangeRate" where "scenarioId" = 'PPTO_V1' and "isActive"`);
    expect(res.body.rows).toHaveLength(expected[0].n);
  });

  it('sin runId, ratesHash coincide con la fórmula de fnConsolidationRunSnapshot', async () => {
    const res = await get('controller', '/api/scenarios/PPTO_V1/rates', 200);
    const [row] = await asOwner((sql) => sql<{ ratesHash: string }[]>`
      select md5(string_agg(concat_ws('|', "periodCode", "currencyCode", "rateTypeCode", "rateToUsd"), ','
                            order by "periodCode", "currencyCode", "rateTypeCode")) as "ratesHash"
        from "groupExchangeRate" where "scenarioId" = 'PPTO_V1'`);
    expect(res.body.ratesHash).toBe(row.ratesHash);
  });

  it('con runId del mismo escenario: hash de la corrida, filas actuales, sin fingir snapshot', async () => {
    const res = await get('controller', `/api/scenarios/PPTO_V1/rates?runId=${v1RunId}`, 200);
    const [run] = await asOwner((sql) => sql<{ ratesHash: string | null }[]>`
      select "ratesHash" from "consolidationRun" where "runId" = ${v1RunId}`);
    expect(res.body.historicalSnapshot).toBe(false);
    expect(res.body.ratesHash).toBe(run.ratesHash);
    expect(res.body.rows.length).toBeGreaterThan(0);
  });

  it('runId de otro escenario o inexistente → 404; un usuario local no ve la corrida', async () => {
    await get('controller', `/api/scenarios/PPTO_V1/rates?runId=${v2RunId}`, 404);
    await get('controller', '/api/scenarios/PPTO_V1/rates?runId=00000000-0000-4000-8000-0000000000bb', 404);
    await get('gt1Accountant', `/api/scenarios/PPTO_V1/rates?runId=${v1RunId}`, 404);
  });
});
