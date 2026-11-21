/**
 * QB-13 (conciliación IC) y QB-14 (consolidación) contra el oráculo V2
 * (resultados_referencia/v2_*.csv, motor_referencia.py): ±1 USD por cuenta, lineageOk, 131 = 39 + 92.
 * Base LOCAL 01..05 + 07 con las cargas V2 aprobadas (como el paso 4 del seed 06).
 */
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { startApp } from '../support/app';
import { asOwner, asUser } from '../support/claims-sql';
import { USERS, type UserKey } from '../support/fixtures';
import { num, readOracleCsv } from '../support/oracle';
import { startTestJwks, type TestJwks } from '../support/tokens';

const TOL_USD = 0.01; // tolerancia oficial (QA-H3)

describe('Motor QB-13 / QB-14 (oráculo V2)', () => {
  let app: NestExpressApplication;
  let jwks: TestJwks;
  let runId: string;
  let runsBefore: Array<{ runId: string }>;
  let fingerprintBefore: string;

  const auth = async (user: UserKey) => `Bearer ${await jwks.sign(USERS[user].id)}`;
  const get = async (user: UserKey, path: string, expected: number) =>
    request(app.getHttpServer()).get(path).set('Authorization', await auth(user)).expect(expected);
  const post = async (user: UserKey, path: string, expected: number) =>
    request(app.getHttpServer()).post(path).set('Authorization', await auth(user)).expect(expected);

  /** Huella de TODAS las filas de las corridas que existían antes del motor. */
  const fingerprint = async (runIds: string[]) => {
    const [row] = await asOwner((sql) => sql<{ md5: string }[]>`
      select md5(concat_ws('#',
        (select string_agg(t::text, '|' order by t::text) from "consolidationRun" t where "runId" = any(${runIds}::uuid[])),
        (select string_agg(t::text, '|' order by t::text) from "consolidationRunLoad" t where "runId" = any(${runIds}::uuid[])),
        (select string_agg(t::text, '|' order by t::text) from "icReconciliation" t where "runId" = any(${runIds}::uuid[])),
        (select string_agg(t::text, '|' order by t::text) from "elimination" t where "runId" = any(${runIds}::uuid[])),
        (select string_agg(t::text, '|' order by t::text) from "consolidatedBalance" t where "runId" = any(${runIds}::uuid[])),
        (select string_agg(t::text, '|' order by t::text) from "lineage" t where "runId" = any(${runIds}::uuid[])))) as md5`);
    return row.md5;
  };

  beforeAll(async () => {
    jwks = await startTestJwks();
    app = await startApp(jwks);
    runsBefore = await asOwner((sql) => sql<{ runId: string }[]>`select "runId" from "consolidationRun"`);
    fingerprintBefore = await fingerprint(runsBefore.map((r) => r.runId));
    const res = await post('controller', '/api/scenarios/PPTO_V2/consolidate', 201);
    runId = res.body.run.runId;
  });
  afterAll(async () => {
    await app.close();
    await jwks.close();
  });

  it('POST consolidate crea una corrida NUEVA con parámetros congelados, hash de tasas y lineageOk', async () => {
    const res = await get('auditor', `/api/runs/${runId}`, 200);
    expect(res.body.run).toMatchObject({ runId, scenarioId: 'PPTO_V2', lineageOk: true });
    expect(res.body.run.parameterSnapshot).toMatchObject({ TOLERANCIA_FX_USD: 50, TOLERANCIA_FX_PCT: 0.02 });
    expect(res.body.run.ratesHash).toMatch(/^[0-9a-f]{32}$/);
    expect(res.body.loads.length).toBeGreaterThan(0);
    expect(new Set(res.body.loads.map((l: { statusCode: string }) => l.statusCode))).toEqual(new Set(['APROBADA']));
  });

  it('no borra ni modifica corridas existentes; cada POST es otra corrida', async () => {
    expect(runsBefore.map((r) => r.runId)).not.toContain(runId);
    expect(await fingerprint(runsBefore.map((r) => r.runId))).toBe(fingerprintBefore);
    const second = (await post('controller', '/api/scenarios/PPTO_V2/consolidate', 201)).body.run.runId;
    expect(second).not.toBe(runId);
    expect(await fingerprint(runsBefore.map((r) => r.runId))).toBe(fingerprintBefore);
  });

  it('QB-13: 131 documentos = 39 CONCILIADO + 92 CONCILIADO_FX, mismo estado y legs que el oráculo', async () => {
    const res = await get('controller', `/api/runs/${runId}/reconciliation`, 200);
    expect(res.body.summary).toEqual({ CONCILIADO: 39, CONCILIADO_FX: 92 });
    const oracle = readOracleCsv('v2_conciliacion_ic.csv');
    expect(res.body.reconciliation).toHaveLength(oracle.length);
    const byKey = new Map(res.body.reconciliation.map((r: Record<string, string>) => [`${r.icDocumentId}|${r.financialStatementCode}`, r]));
    for (const o of oracle) {
      const r = byKey.get(`${o.doc_ic_id}|${o.estado_financiero}`) as Record<string, string>;
      expect(r).toMatchObject({ statusCode: o.estado, issuerCompanyId: o.emisor, receiverCompanyId: o.receptor, lineRefs: o.lineas });
      expect(Math.abs(num(r.issuerUsd) - num(o.usd_emisor))).toBeLessThanOrEqual(TOL_USD);
      expect(Math.abs(num(r.receiverUsd) - num(o.usd_receptor))).toBeLessThanOrEqual(TOL_USD);
    }
  });

  it('QB-13: matrices IC (facturado y saldos) ±1 USD contra el oráculo', async () => {
    const res = await get('controller', `/api/runs/${runId}/ic-matrix`, 200);
    const check = (file: string, rows: Array<Record<string, string>>, row: string, col: string, value: string) => {
      const got = new Map<string, number>();
      for (const r of rows) got.set(`${r[row]}|${r[col]}`, (got.get(`${r[row]}|${r[col]}`) ?? 0) + num(r[value]));
      for (const o of readOracleCsv(file)) {
        for (const [partner, v] of Object.entries(o)) {
          if (partner === 'empresa') continue;
          expect(Math.abs((got.get(`${o.empresa}|${partner}`) ?? 0) - num(v))).toBeLessThanOrEqual(TOL_USD);
        }
      }
    };
    check('v2_matriz_ic_facturado_usd.csv', res.body.billed, 'issuerCompanyId', 'receiverCompanyId', 'billedUsd');
    check('v2_matriz_ic_saldos_usd.csv', res.body.balances, 'companyId', 'partnerCompanyId', 'balanceUsd');
  });

  it('QA-H4: la matriz de la corrida no cambia si se reemplazan las cargas APROBADA actuales', async () => {
    const before = (await get('controller', `/api/runs/${runId}/ic-matrix`, 200)).body;
    expect(before.billed.length).toBeGreaterThan(0);
    // Nueva versión PYG de GT1, sin líneas IC: al aprobarla sustituye la carga de la corrida en el escenario,
    // pero no en la foto de la corrida (sigue apuntando a la carga original, ya REEMPLAZADA).
    await asOwner((sql) => sql`
      insert into "dataLoad" ("companyId", "scenarioId", "financialStatementCode", "fileName", "version")
      values ('GT1', 'PPTO_V2', 'PYG', 'qa-h4-reemplazo.csv', 99)`);
    await asOwner((sql) => sql`
      update "dataLoad"
         set "statusCode" = 'APROBADA'
       where "companyId" = 'GT1' and "scenarioId" = 'PPTO_V2' and "financialStatementCode" = 'PYG' and "version" = 99`);
    const scenarioNow = await asOwner((sql) => sql<{ n: number }[]>`
      select count(*)::int as n from "vIcBilledMatrix"
       where "scenarioId" = 'PPTO_V2' and "issuerCompanyId" = 'GT1'`);
    expect(scenarioNow[0].n).toBe(0); // la vista del escenario ya no ve las ventas IC de GT1
    const after = (await get('controller', `/api/runs/${runId}/ic-matrix`, 200)).body;
    expect(after.billed).toEqual(before.billed);
    expect(after.balances).toEqual(before.balances);
    // Limpia la carga extra para no alterar el conteo de los otros e2e que comparten la base.
    await asOwner((sql) => sql`
      delete from "dataLoad"
       where "companyId" = 'GT1' and "scenarioId" = 'PPTO_V2' and "financialStatementCode" = 'PYG' and "version" = 99`);
  });

  it('QA-H4: una corrida sin cargas (como la V1 del 06) arma la matriz con su conciliación', async () => {
    const [created] = await asOwner((sql) => sql<{ runId: string }[]>`
      insert into "consolidationRun" ("scenarioId", "notes")
      values ('PPTO_V1', 'qa-h4 run without loads')
      returning "runId"`);
    const v1RunId = created.runId;
    await asOwner((sql) => sql`
      insert into "icReconciliation" ("runId", "icDocumentId", "financialStatementCode",
        "issuerCompanyId", "receiverCompanyId", "statusCode", "issuerUsd", "receiverUsd", "differenceUsd", "lineRefs")
      values
        (${v1RunId}, 'QA-H4-PYG', 'PYG', 'GT1', 'MX1', 'CONCILIADO', 1000, 1000, 0, 'qa#1;qa#2'),
        (${v1RunId}, 'QA-H4-BAL', 'BALANCE', 'GT1', 'MX1', 'CONCILIADO', 400, 400, 0, 'qa#3;qa#4')`);
    const scenario = await asOwner((sql) => sql<{ n: number }[]>`
      select count(*)::int as n from "vIcBilledMatrix" where "scenarioId" = 'PPTO_V1'`);
    expect(scenario[0].n).toBe(0);
    const res = await get('controller', `/api/runs/${v1RunId}/ic-matrix`, 200);
    expect(res.body.billed).toEqual([
      expect.objectContaining({ issuerCompanyId: 'GT1', receiverCompanyId: 'MX1', billedUsd: '1000.00' }),
    ]);
    const bal = res.body.balances.map((r: { companyId: string; partnerCompanyId: string; balanceUsd: string }) => ({
      companyId: r.companyId, partnerCompanyId: r.partnerCompanyId, balanceUsd: Number(r.balanceUsd),
    }));
    expect(bal).toEqual(
      expect.arrayContaining([
        { companyId: 'GT1', partnerCompanyId: 'MX1', balanceUsd: 400 },
        { companyId: 'MX1', partnerCompanyId: 'GT1', balanceUsd: -400 },
      ]),
    );
    expect(bal).toHaveLength(2);
  });

  it('QB-14: consolidado por cuenta ±1 USD (agregado, eliminaciones, CTA, consolidado)', async () => {
    const res = await get('auditor', `/api/runs/${runId}/consolidated`, 200);
    const oracle = readOracleCsv('v2_consolidado.csv');
    const got = new Map(res.body.accounts.map((a: Record<string, string>) => [a.groupAccountId, a]));
    expect([...got.keys()].sort()).toEqual(oracle.map((o) => o.cuenta_grupo).sort());
    for (const o of oracle) {
      const a = got.get(o.cuenta_grupo) as Record<string, string>;
      expect(Math.abs(num(a.aggregatedUsd) - num(o.agregado))).toBeLessThanOrEqual(TOL_USD);
      expect(Math.abs(num(a.eliminationsUsd) - num(o.eliminaciones))).toBeLessThanOrEqual(TOL_USD);
      expect(Math.abs(num(a.translationAdjustmentUsd) - num(o.cta_conversion))).toBeLessThanOrEqual(TOL_USD);
      expect(Math.abs(num(a.consolidatedUsd) - num(o.consolidado))).toBeLessThanOrEqual(TOL_USD);
    }
  });

  it('QB-14: eliminaciones solo E1–E4 y E7, mismas por regla y ±1 USD por asiento', async () => {
    const res = await get('controller', `/api/runs/${runId}/eliminations`, 200);
    const oracle = readOracleCsv('v2_eliminaciones.csv');
    const count = (rows: string[]) => rows.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r]: (acc[r] ?? 0) + 1 }), {});
    expect(count(res.body.eliminations.map((e: { eliminationRuleCode: string }) => e.eliminationRuleCode))).toEqual(count(oracle.map((o) => o.regla)));
    const got = new Map(
      res.body.eliminations.map((e: Record<string, string | null>) => [`${e.eliminationCode}|${e.eliminationRuleCode}|${e.companyId ?? 'GRUPO'}|${e.groupAccountId}`, e]),
    );
    for (const o of oracle) {
      const e = got.get(`${o.elim_id}|${o.regla}|${o.empresa}|${o.cuenta_grupo}`) as Record<string, string>;
      expect(e).toBeDefined();
      expect(Math.abs(num(e.effectUsd) - num(o.efecto_usd))).toBeLessThanOrEqual(TOL_USD);
    }
  });

  it('QB-14: linaje = oráculo (filas por tipo) y Σ linaje por cuenta = consolidado (±0.01)', async () => {
    const lineage = await asUser(USERS.controller.id, (sql) => sql<{ sourceTypeCode: string; n: number }[]>`
      select "sourceTypeCode", count(*)::int as n from "lineage" where "runId" = ${runId} group by 1`);
    const oracle = readOracleCsv('v2_linaje.csv');
    const expected: Record<string, number> = {};
    for (const o of oracle) expected[o.origen_tipo] = (expected[o.origen_tipo] ?? 0) + 1;
    expect(Object.fromEntries(lineage.map((l) => [l.sourceTypeCode, l.n]))).toEqual(expected);
    const bad = await asUser(USERS.controller.id, (sql) => sql`
      select c."groupAccountId" from "consolidatedBalance" c
      left join (select "groupAccountId", sum("contributionUsd") s from "lineage" where "runId" = ${runId} group by 1) l using ("groupAccountId")
      where c."runId" = ${runId} and abs(c."consolidatedUsd" - coalesce(l.s, 0)) > 0.01`);
    expect(bad).toHaveLength(0);
    const [line] = await asUser(USERS.controller.id, (sql) => sql<{ sourceId: string; companyId: string }[]>`
      select "sourceId", "companyId" from "lineage" where "runId" = ${runId} and "sourceTypeCode" = 'LINEA_CARGA' limit 1`);
    expect(line.sourceId).toMatch(/^[a-z]+_[A-Z0-9]+_V2\.csv#fila\d+$/);
    expect(line.companyId).toMatch(/^[A-Z]{2}\d$/);
    const cta = await asUser(USERS.controller.id, (sql) => sql<{ groupAccountId: string; companyId: string | null }[]>`
      select "groupAccountId", "companyId" from "lineage" where "runId" = ${runId} and "sourceTypeCode" = 'CTA_CONVERSION'`);
    expect(cta).toEqual([{ groupAccountId: '3900', companyId: null }]);
  });

  it('QB-14: KPIs de grupo (vGroupKpi) — ventas y EBIT ±1 USD contra el oráculo', async () => {
    const res = await get('controller', `/api/runs/${runId}/kpis`, 200);
    const oracle = readOracleCsv('v2_kpis_grupo.csv');
    for (const [vista, basis] of [['consolidado (con eliminaciones)', 'CONSOLIDADO'], ['agregado (sin eliminar)', 'AGREGADO']]) {
      const o = oracle.find((r) => r.vista === vista)!;
      const k = res.body.group.find((g: { basisCode: string }) => g.basisCode === basis);
      expect(Math.abs(num(k.salesUsd) - num(o.ventas_usd))).toBeLessThanOrEqual(TOL_USD);
      expect(Math.abs(num(k.ebitUsd) - num(o.ebit_usd))).toBeLessThanOrEqual(TOL_USD);
    }
  });

  it('la corrida es inmutable: ni fnConciliar de nuevo ni UPDATE de resultados', async () => {
    await expect(asUser(USERS.controller.id, (sql) => sql`select "fnConciliar"(${runId})`)).rejects.toMatchObject({ code: '23514' });
    await expect(
      asUser(USERS.controller.id, (sql) => sql`update "consolidatedBalance" set "aggregatedUsd" = 0 where "runId" = ${runId}`),
    ).rejects.toBeDefined();
  });

  it('sin cargas APROBADA (PPTO_V1 local: RECIBIDA) → 409 y no crea corrida; escenario inexistente → 404', async () => {
    const [{ n: before }] = await asOwner((sql) => sql<{ n: number }[]>`select count(*)::int n from "consolidationRun"`);
    const res = await post('controller', '/api/scenarios/PPTO_V1/consolidate', 409);
    expect(res.body.message).toMatch(/APROBADA/);
    await post('controller', '/api/scenarios/NO_EXISTE/consolidate', 404);
    const [{ n: after }] = await asOwner((sql) => sql<{ n: number }[]>`select count(*)::int n from "consolidationRun"`);
    expect(after).toBe(before);
  });

  it('permisos: consolidar exige writeAll; lecturas de corrida exigen readAll; 401 sin token', async () => {
    await post('auditor', '/api/scenarios/PPTO_V2/consolidate', 403);
    await post('gt1Accountant', '/api/scenarios/PPTO_V2/consolidate', 403);
    await post('noGrant', '/api/scenarios/PPTO_V2/consolidate', 403);
    await request(app.getHttpServer()).post('/api/scenarios/PPTO_V2/consolidate').expect(401);
    for (const path of ['', '/consolidated', '/eliminations', '/reconciliation', '/ic-matrix']) {
      await get('gt1Accountant', `/api/runs/${runId}${path}`, 403);
    }
    await get('controller', '/api/runs/00000000-0000-4000-8000-0000000000ff/consolidated', 404);
  });

  it('QA-H18: GET /api/runs/:id para una corrida de referencia sin consolidationRunLoad devuelve las 12 cargas del escenario', async () => {
    const [v1Run] = await asOwner(
      (sql) => sql<{ runId: string }[]>`select "runId" from "consolidationRun" where "scenarioId" = 'PPTO_V1' limit 1`,
    );
    const res = await get('controller', `/api/runs/${v1Run.runId}`, 200);
    expect(res.body.run.scenarioId).toBe('PPTO_V1');
    expect(res.body.loads.length).toBeGreaterThanOrEqual(12);
    expect(res.body.loads.every((l: { scenarioId?: string }) => !l.scenarioId || l.scenarioId === 'PPTO_V1')).toBe(true);
  });
});
