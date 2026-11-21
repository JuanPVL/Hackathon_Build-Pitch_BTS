/**
 * QB-07: lectura de cargas, hallazgos y KPIs de grupo con recorte RLS por empresa.
 * La "verdad" es lo que ve el mismo usuario en SQL con su JWT (claims + rol authenticated).
 */
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { startApp } from '../support/app';
import { asOwner, asUser } from '../support/claims-sql';
import { USERS, type UserKey } from '../support/fixtures';
import { startTestJwks, type TestJwks } from '../support/tokens';

describe('Lecturas It-0 (QB-07)', () => {
  let app: NestExpressApplication;
  let jwks: TestJwks;
  let runId: string;
  let mx1LoadId: string;
  let gt1LoadId: string;

  const get = async (user: UserKey, path: string, expected: number) =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${await jwks.sign(USERS[user].id)}`).expect(expected);

  beforeAll(async () => {
    jwks = await startTestJwks();
    app = await startApp(jwks);
    const [run] = await asOwner((sql) => sql<{ runId: string }[]>`select "runId" from "consolidationRun" where "scenarioId" = 'PPTO_V1' limit 1`);
    runId = run.runId;
    const loads = await asOwner((sql) => sql<{ loadId: string; companyId: string }[]>`select "loadId", "companyId" from "dataLoad" where "companyId" in ('GT1','MX1') order by "loadId"`);
    mx1LoadId = loads.find((l) => l.companyId === 'MX1')!.loadId;
    gt1LoadId = loads.find((l) => l.companyId === 'GT1')!.loadId;
  });
  afterAll(async () => {
    await app.close();
    await jwks.close();
  });

  describe.each(['gt1Accountant', 'gt1Viewer'] as const)('%s (empresa GT1)', (user) => {
    it('lista solo cargas de GT1, igual que su SQL con JWT', async () => {
      const res = await get(user, '/api/loads', 200);
      const companies = new Set(res.body.map((l: { companyId: string }) => l.companyId));
      expect([...companies]).toEqual(['GT1']);
      const expected = await asUser(USERS[user].id, (sql) => sql<{ loadId: string }[]>`select "loadId" from "dataLoad"`);
      expect(res.body.map((l: { loadId: string }) => l.loadId).sort()).toEqual(expected.map((r) => r.loadId).sort());
      expect(res.body).toHaveLength(4);
    });

    it('ve el detalle (con líneas) de una carga de GT1 y 404 en una de MX1', async () => {
      const own = await get(user, `/api/loads/${gt1LoadId}`, 200);
      expect(own.body.companyId).toBe('GT1');
      expect(own.body.lines.length).toBeGreaterThan(0);
      expect(own.body.lines.every((l: { loadId: string }) => l.loadId === gt1LoadId)).toBe(true);
      await get(user, `/api/loads/${mx1LoadId}`, 404);
    });

    it('solo ve hallazgos de GT1 (ni de MX1 ni los de "loadId" null)', async () => {
      const res = await get(user, '/api/scenarios/PPTO_V1/findings', 200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ companyCode: 'GT1' });
      expect(res.body.some((f: { loadId: string | null }) => f.loadId === null)).toBe(false);
    });

    it('KPIs de grupo → 403', async () => {
      await get(user, `/api/runs/${runId}/kpis`, 403);
    });
  });

  it('un contador de MX1 no ve cargas de GT1', async () => {
    const res = await get('mx1Accountant', '/api/loads', 200);
    expect(new Set(res.body.map((l: { companyId: string }) => l.companyId))).toEqual(new Set(['MX1']));
  });

  describe.each(['controller', 'auditor'] as const)('%s (readAll)', (user) => {
    it('ve las 24 cargas del grupo y filtra por escenario', async () => {
      expect((await get(user, '/api/loads', 200)).body).toHaveLength(24);
      const v1 = (await get(user, '/api/loads?scenarioId=PPTO_V1', 200)).body;
      expect(v1).toHaveLength(12);
      expect(v1.every((l: { scenarioId: string }) => l.scenarioId === 'PPTO_V1')).toBe(true);
    });

    it('ve todos los hallazgos del escenario, incluido el de grupo', async () => {
      const res = await get(user, '/api/scenarios/PPTO_V1/findings', 200);
      expect(res.body).toHaveLength(3);
      expect(res.body.filter((f: { loadId: string | null }) => f.loadId === null)).toHaveLength(1);
    });

    it('lee "vGroupKpi" de la corrida igual que en SQL con su JWT', async () => {
      const res = await get(user, `/api/runs/${runId}/kpis`, 200);
      expect(res.body.run.runId).toBe(runId);
      const expected = await asUser(
        USERS[user].id,
        (sql) => sql<{ basisCode: string; salesUsd: string; ebitUsd: string }[]>`
          select "basisCode", "salesUsd"::text, "ebitUsd"::text from "vGroupKpi" where "runId" = ${runId} order by "basisCode"`,
      );
      expect(expected.length).toBeGreaterThan(0);
      expect(res.body.group.map((k: { basisCode: string; salesUsd: string; ebitUsd: string }) => [k.basisCode, Number(k.salesUsd), Number(k.ebitUsd)])).toEqual(
        expected.map((k) => [k.basisCode, Number(k.salesUsd), Number(k.ebitUsd)]),
      );
    });
  });

  it('corrida inexistente → 404; parámetros mal formados → 400', async () => {
    await get('controller', '/api/runs/00000000-0000-4000-8000-0000000000bb/kpis', 404);
    await get('controller', '/api/runs/no-es-uuid/kpis', 400);
    await get('controller', '/api/loads/no-es-uuid', 400);
    await get('controller', "/api/loads?scenarioId=x'or'1", 400);
  });
});
