/**
 * P0-3 (/api/loads/upload), P0-4 (/api/loads/:id/validate) y P0-5 (/api/loads/:id/approve):
 * permisos por rol y empresa, validación de CSV, versionado sin sobrescribir,
 * transiciones de estado (RECIBIDA -> VALIDADA/CUARENTENA -> APROBADA) y auditoría con userId real.
 */
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { startApp } from '../support/app';
import { asOwner } from '../support/claims-sql';
import { USERS, type UserKey } from '../support/fixtures';
import { startTestJwks, type TestJwks } from '../support/tokens';

const CSV_HEADER =
  'empresa,escenario,periodo,cuenta_local,descripcion,moneda,monto,socio_ic,doc_ic_id,moneda_tx,monto_tx,contraparte_id_fiscal,volumen,precio';

/** Balance mínimo válido de GT1 que cuadra (Activo 1000 = Pasivo 400 + Patrimonio 600). */
function validBalanceCsv(companyId = 'GT1', scenarioId = 'PPTO_V1', currency = 'GTQ'): Buffer {
  const rows = [
    CSV_HEADER,
    `${companyId},${scenarioId},2027-12,1.1.01,Efectivo,${currency},1000,,,,,,,`,
    `${companyId},${scenarioId},2027-12,2.1.01,Cuentas por pagar terceros,${currency},400,,,,,,,`,
    `${companyId},${scenarioId},2027-12,3.1.01,Capital social,${currency},600,,,,,,,`,
  ];
  return Buffer.from(rows.join('\n'), 'utf8');
}

/** Balance de GT1 con errores (V02 moneda incorrecta, V06 no cuadra, V07 monto negativo). */
function invalidBalanceCsv(companyId = 'GT1', scenarioId = 'PPTO_V1'): Buffer {
  const rows = [
    CSV_HEADER,
    `${companyId},${scenarioId},2027-12,1.1.01,Efectivo,USD,-500,,,,,,,`,
    `${companyId},${scenarioId},2027-12,2.1.01,Cuentas por pagar terceros,GTQ,400,,,,,,,`,
  ];
  return Buffer.from(rows.join('\n'), 'utf8');
}

describe('Flujo de cargas CSV: upload → validate → approve (P0-3, P0-4, P0-5)', () => {
  let app: NestExpressApplication;
  let jwks: TestJwks;
  const createdLoadIds: string[] = [];

  const token = (user: UserKey) => jwks.sign(USERS[user].id);

  beforeAll(async () => {
    jwks = await startTestJwks();
    app = await startApp(jwks);
  });

  afterAll(async () => {
    if (createdLoadIds.length > 0) {
      await asOwner((sql) => sql`
        update "dataLoad" set "statusCode" = 'REEMPLAZADA'
         where "loadId" = any(${createdLoadIds}::uuid[]) and "statusCode" = 'APROBADA'`);
      await asOwner((sql) => sql`
        delete from "dataLoad" where "loadId" = any(${createdLoadIds}::uuid[])`);
    }
    await app.close();
    await jwks.close();
  });

  describe('Permisos por rol y empresa', () => {
    it('401 sin token; 403 para AUDITOR, COMPANY_VIEWER y usuario sin grants', async () => {
      await request(app.getHttpServer())
        .post('/api/loads/upload')
        .field('companyId', 'GT1')
        .field('scenarioId', 'PPTO_V1')
        .attach('file', validBalanceCsv(), { filename: 'balance_GT1_test.csv', contentType: 'text/csv' })
        .expect(401);

      for (const role of ['auditor', 'gt1Viewer', 'noGrant'] as const) {
        await request(app.getHttpServer())
          .post('/api/loads/upload')
          .set('Authorization', `Bearer ${await token(role)}`)
          .field('companyId', 'GT1')
          .field('scenarioId', 'PPTO_V1')
          .attach('file', validBalanceCsv(), { filename: 'balance_GT1_test.csv', contentType: 'text/csv' })
          .expect(403);
      }
    });

    it('COMPANY_ACCOUNTANT de GT1 no puede subir, validar ni aprobar cargas de MX1 (403 / 404 RLS)', async () => {
      await request(app.getHttpServer())
        .post('/api/loads/upload')
        .set('Authorization', `Bearer ${await token('gt1Accountant')}`)
        .field('companyId', 'MX1')
        .field('scenarioId', 'PPTO_V1')
        .attach('file', validBalanceCsv('MX1', 'PPTO_V1', 'MXN'), {
          filename: 'balance_MX1_test.csv',
          contentType: 'text/csv',
        })
        .expect(403);

      const [mx1Load] = await asOwner(
        (sql) => sql<{ loadId: string }[]>`
          select "loadId" from "dataLoad" where "companyId" = 'MX1' and "scenarioId" = 'PPTO_V1' limit 1`,
      );
      // RLS oculta cargas de MX1 a gt1Accountant (404) y a roles de solo lectura les da 403/404
      await request(app.getHttpServer())
        .post(`/api/loads/${mx1Load.loadId}/validate`)
        .set('Authorization', `Bearer ${await token('gt1Accountant')}`)
        .expect(404);
      await request(app.getHttpServer())
        .post(`/api/loads/${mx1Load.loadId}/approve`)
        .set('Authorization', `Bearer ${await token('gt1Accountant')}`)
        .expect(404);
      await request(app.getHttpServer())
        .post(`/api/loads/${mx1Load.loadId}/validate`)
        .set('Authorization', `Bearer ${await token('auditor')}`)
        .expect(403);
      await request(app.getHttpServer())
        .post(`/api/loads/${mx1Load.loadId}/approve`)
        .set('Authorization', `Bearer ${await token('auditor')}`)
        .expect(403);
    });
  });

  describe('Validación de archivo CSV en upload (P0-3)', () => {
    it('rechaza peticiones sin archivo, extensión distinta de .csv o encabezados inválidos (400)', async () => {
      const authHeader = `Bearer ${await token('gt1Accountant')}`;

      await request(app.getHttpServer())
        .post('/api/loads/upload')
        .set('Authorization', authHeader)
        .field('companyId', 'GT1')
        .field('scenarioId', 'PPTO_V1')
        .expect(400);

      await request(app.getHttpServer())
        .post('/api/loads/upload')
        .set('Authorization', authHeader)
        .field('companyId', 'GT1')
        .field('scenarioId', 'PPTO_V1')
        .attach('file', Buffer.from('hola'), { filename: 'malo.txt', contentType: 'text/plain' })
        .expect(400);

      const badHeaders = Buffer.from('empresa,escenario,monto\nGT1,PPTO_V1,100\n', 'utf8');
      const res = await request(app.getHttpServer())
        .post('/api/loads/upload')
        .set('Authorization', authHeader)
        .field('companyId', 'GT1')
        .field('scenarioId', 'PPTO_V1')
        .attach('file', badHeaders, { filename: 'balance_GT1_bad.csv', contentType: 'text/csv' })
        .expect(400);
      expect(res.body.message).toMatch(/Encabezados CSV inválidos/);
    });
  });

  describe('Versionado, transiciones de estado y auditoría (P0-3, P0-4, P0-5)', () => {
    let v2LoadId: string;
    let v3LoadId: string;

    it('sube CSV como COMPANY_ACCOUNTANT en su empresa (GT1): crea versión nueva en RECIBIDA sin sobrescribir la v1', async () => {
      const [v1Before] = await asOwner(
        (sql) => sql<{ loadId: string; version: number; statusCode: string }[]>`
          select "loadId", "version", "statusCode"
            from "dataLoad"
           where "companyId" = 'GT1' and "scenarioId" = 'PPTO_V1' and "financialStatementCode" = 'BALANCE' and "version" = 1`,
      );
      expect(v1Before).toBeDefined();

      const res = await request(app.getHttpServer())
        .post('/api/loads/upload')
        .set('Authorization', `Bearer ${await token('gt1Accountant')}`)
        .field('companyId', 'GT1')
        .field('scenarioId', 'PPTO_V1')
        .attach('file', invalidBalanceCsv('GT1', 'PPTO_V1'), {
          filename: 'balance_GT1_V1.csv',
          contentType: 'text/csv',
        })
        .expect(201);

      v2LoadId = res.body.loadId;
      createdLoadIds.push(v2LoadId);

      expect(res.body).toMatchObject({
        companyId: 'GT1',
        scenarioId: 'PPTO_V1',
        financialStatementCode: 'BALANCE',
        fileName: 'balance_GT1_V1.csv',
        version: 2,
        statusCode: 'RECIBIDA',
        rowCount: 2,
        uploadedBy: USERS.gt1Accountant.id,
      });

      // La versión 1 anterior sigue intacta con sus líneas originales
      const [v1After] = await asOwner(
        (sql) => sql<{ loadId: string; version: number; statusCode: string; linesCount: number }[]>`
          select d."loadId", d."version", d."statusCode",
                 (select count(*)::int from "dataLoadLine" l where l."loadId" = d."loadId") as "linesCount"
            from "dataLoad" d
           where d."loadId" = ${v1Before.loadId}`,
      );
      expect(v1After.version).toBe(1);
      expect(v1After.linesCount).toBe(11);
    });

    it('no permite aprobar una carga en estado RECIBIDA sin validar antes (409)', async () => {
      await request(app.getHttpServer())
        .post(`/api/loads/${v2LoadId}/approve`)
        .set('Authorization', `Bearer ${await token('controller')}`)
        .expect(409);
    });

    it('POST /api/loads/:id/validate con errores mueve la carga a CUARENTENA y guarda los hallazgos', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/loads/${v2LoadId}/validate`)
        .set('Authorization', `Bearer ${await token('gt1Accountant')}`)
        .expect(200);

      expect(res.body.statusCode).toBe('CUARENTENA');
      expect(res.body.totals.blocking).toBeGreaterThan(0);
      expect(res.body.findingsCount).toBeGreaterThan(0);
      const rules = res.body.findings.map((f: { ruleCode: string }) => f.ruleCode);
      expect(rules).toEqual(expect.arrayContaining(['V02', 'V06', 'V07']));
    });

    it('no permite aprobar una carga en estado CUARENTENA (409)', async () => {
      await request(app.getHttpServer())
        .post(`/api/loads/${v2LoadId}/approve`)
        .set('Authorization', `Bearer ${await token('controller')}`)
        .expect(409);
    });

    it('subir nueva versión corregida (v3), validar (pasa a VALIDADA) y aprobar (pasa a APROBADA)', async () => {
      // Subida por GROUP_CONTROLLER (puede en todas las empresas)
      const up = await request(app.getHttpServer())
        .post('/api/loads/upload')
        .set('Authorization', `Bearer ${await token('controller')}`)
        .field('companyId', 'GT1')
        .field('scenarioId', 'PPTO_V1')
        .attach('file', validBalanceCsv('GT1', 'PPTO_V1', 'GTQ'), {
          filename: 'balance_GT1_V1.csv',
          contentType: 'text/csv',
        })
        .expect(201);

      v3LoadId = up.body.loadId;
      createdLoadIds.push(v3LoadId);
      expect(up.body.version).toBe(3);
      expect(up.body.statusCode).toBe('RECIBIDA');

      // COMPANY_VIEWER no puede validar ni aprobar (403)
      await request(app.getHttpServer())
        .post(`/api/loads/${v3LoadId}/validate`)
        .set('Authorization', `Bearer ${await token('gt1Viewer')}`)
        .expect(403);

      // Validar → 0 hallazgos → VALIDADA
      const val = await request(app.getHttpServer())
        .post(`/api/loads/${v3LoadId}/validate`)
        .set('Authorization', `Bearer ${await token('gt1Accountant')}`)
        .expect(200);
      expect(val.body).toMatchObject({
        loadId: v3LoadId,
        version: 3,
        statusCode: 'VALIDADA',
        totals: { blocking: 0, warnings: 0, info: 0 },
        findingsCount: 0,
        findings: [],
      });

      // COMPANY_VIEWER no puede aprobar (403)
      await request(app.getHttpServer())
        .post(`/api/loads/${v3LoadId}/approve`)
        .set('Authorization', `Bearer ${await token('gt1Viewer')}`)
        .expect(403);

      // Separación de funciones: el contador que sube/valida su carga NO puede aprobarla (403)
      await request(app.getHttpServer())
        .post(`/api/loads/${v3LoadId}/approve`)
        .set('Authorization', `Bearer ${await token('gt1Accountant')}`)
        .send({ justification: 'Intento de autoaprobación' })
        .expect(403);
      const [stillValidated] = await asOwner(
        (sql) => sql<{ statusCode: string }[]>`select "statusCode" from "dataLoad" where "loadId" = ${v3LoadId}`,
      );
      expect(stillValidated.statusCode).toBe('VALIDADA');

      // Aprobar desde VALIDADA → APROBADA solo lo hace el GROUP_CONTROLLER
      const appRes = await request(app.getHttpServer())
        .post(`/api/loads/${v3LoadId}/approve`)
        .set('Authorization', `Bearer ${await token('controller')}`)
        .send({ justification: 'Balance cuadrado verificado' })
        .expect(200);

      expect(appRes.body).toMatchObject({
        loadId: v3LoadId,
        companyId: 'GT1',
        scenarioId: 'PPTO_V1',
        financialStatementCode: 'BALANCE',
        version: 3,
        statusCode: 'APROBADA',
        approvedBy: USERS.controller.id,
      });
      expect(appRes.body.approvedAt).toEqual(expect.any(String));

      // Aprobar dos veces una carga ya APROBADA → 409
      await request(app.getHttpServer())
        .post(`/api/loads/${v3LoadId}/approve`)
        .set('Authorization', `Bearer ${await token('controller')}`)
        .expect(409);

      // Auditoría registra el userId real del JWT (nunca null ni otro usuario)
      const [auditRow] = await asOwner(
        (sql) => sql<{ userId: string | null }[]>`
          select "userId"
            from audit."changeLog"
           where "tableName" = 'dataLoad'
             and "operation" = 'UPDATE'
             and ("recordKey" ->> 'loadId') = ${v3LoadId}
           order by "changeLogId" desc
           limit 1`,
      );
      expect(auditRow).toEqual({
        userId: USERS.controller.id,
      });
    });
  });
});
