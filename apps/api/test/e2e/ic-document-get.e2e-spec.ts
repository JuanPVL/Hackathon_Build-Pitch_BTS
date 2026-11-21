/**
 * P0-1: GET /ic-documents/:icDocumentId — versión vigente, permisos y recorte por empresa.
 */
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { startApp } from '../support/app';
import { asOwner } from '../support/claims-sql';
import { USERS, type UserKey } from '../support/fixtures';
import { startTestJwks, type TestJwks } from '../support/tokens';

const DOC = 'T-GT1-MX1-GET';
const VERSIONS = 'T-GT1-MX1-VERSIONS';

describe('GET /ic-documents/:icDocumentId (P0-1)', () => {
  let app: NestExpressApplication;
  let jwks: TestJwks;

  const get = async (user: UserKey | 'anon', path: string, expected: number) => {
    const req = request(app.getHttpServer()).get(path);
    if (user !== 'anon') req.set('Authorization', `Bearer ${await jwks.sign(USERS[user].id)}`);
    return req.expect(expected);
  };

  beforeAll(async () => {
    jwks = await startTestJwks();
    app = await startApp(jwks);
    await asOwner((sql) => sql`
      insert into "icDocument" ("icDocumentId", "version", "scenarioId", "icDocumentTypeCode", "issuerCompanyId",
                                "receiverCompanyId", "transactionCurrencyCode", "transactionAmount", "periodCode")
      values
        (${DOC}, 1, 'PPTO_V1', 'SERVICIO', 'GT1', 'MX1', 'USD', 1000, '2025-01'),
        (${VERSIONS}, 1, 'PPTO_V1', 'SERVICIO', 'GT1', 'MX1', 'USD', 1000, '2025-01'),
        (${VERSIONS}, 2, 'PPTO_V1', 'SERVICIO', 'GT1', 'MX1', 'USD', 2500, '2025-01')`);
    await asOwner((sql) => sql`update "icDocument" set "statusCode" = 'EMITIDA' where "icDocumentId" in (${DOC}, ${VERSIONS})`);
  });
  afterAll(async () => {
    await app.close();
    await jwks.close();
  });

  it('sin token → 401; usuario sin grants → 403', async () => {
    await get('anon', `/api/ic-documents/${DOC}`, 401);
    await get('noGrant', `/api/ic-documents/${DOC}`, 403);
  });

  it('el receptor (MX1) ve la versión vigente, puede aceptar/disputar y solo la pata payable', async () => {
    const res = await get('mx1Accountant', `/api/ic-documents/${DOC}`, 200);
    expect(res.body).toMatchObject({
      icDocumentId: DOC,
      version: 1,
      isCurrent: true,
      scenarioId: 'PPTO_V1',
      statusCode: 'PENDIENTE_ACEPTACION',
      issuerCompanyId: 'GT1',
      receiverCompanyId: 'MX1',
      transactionCurrencyCode: 'USD',
      periodCode: '2025-01',
      permissions: { canAccept: true, canDispute: true },
    });
    expect(Number(res.body.transactionAmount)).toBe(1000);
    expect(res.body.receivable).toBeNull();
    expect(res.body.payable).toMatchObject({ companyId: 'MX1', partnerCompanyId: 'GT1', currencyCode: 'USD' });
    expect(Number(res.body.payable.amount)).toBe(1000);
    expect(res.body.payable.acceptedBy).toBeNull();
    expect(Array.isArray(res.body.sourceRefs)).toBe(true);
  });

  it('el emisor (GT1) lee el documento pero no puede aceptar, y solo ve receivable', async () => {
    const res = await get('gt1Accountant', `/api/ic-documents/${DOC}`, 200);
    expect(res.body.permissions).toEqual({ canAccept: false, canDispute: false });
    expect(res.body.receivable).toMatchObject({ companyId: 'GT1', partnerCompanyId: 'MX1' });
    expect(res.body.payable).toBeNull();
  });

  it('un COMPANY_VIEWER del receptor no puede aceptar ni disputar', async () => {
    const res = await get('gt1Viewer', '/api/ic-documents/T-US2-GT1-VIEWER', 200);
    expect(res.body.permissions).toEqual({ canAccept: false, canDispute: false });
    expect(res.body.statusCode).toBe('PENDIENTE_ACEPTACION');
  });

  it('un AUDITOR lee el documento (readAll) pero no puede aceptar', async () => {
    const res = await get('auditor', `/api/ic-documents/${DOC}`, 200);
    expect(res.body.permissions).toEqual({ canAccept: false, canDispute: false });
    expect(res.body.receivable).not.toBeNull();
    expect(res.body.payable).not.toBeNull();
  });

  it('el GROUP_CONTROLLER puede aceptar (writeAll) y ve ambas patas', async () => {
    const res = await get('controller', `/api/ic-documents/${DOC}`, 200);
    expect(res.body.permissions).toEqual({ canAccept: true, canDispute: true });
    expect(res.body.receivable).not.toBeNull();
    expect(res.body.payable).not.toBeNull();
  });

  it('documento ajeno o BORRADOR no visible → 404', async () => {
    await get('gt1Accountant', '/api/ic-documents/T-US1-MX1-DISPUTE', 404);
    await get('gt1Accountant', '/api/ic-documents/T-US1-GT1-DRAFT', 404);
    await get('mx1Accountant', '/api/ic-documents/T-US1-GT1-DRAFT', 404);
    await get('controller', '/api/ic-documents/no-existe', 404);
  });

  it('scenarioId que no coincide o versión inexistente → 404; parámetros mal formados → 400', async () => {
    await get('mx1Accountant', `/api/ic-documents/${DOC}?scenarioId=PPTO_V1`, 200);
    await get('mx1Accountant', `/api/ic-documents/${DOC}?scenarioId=PPTO_V2`, 404);
    await get('mx1Accountant', `/api/ic-documents/${DOC}?version=99`, 404);
    await get('mx1Accountant', `/api/ic-documents/${DOC}?version=uno`, 400);
    await get('mx1Accountant', `/api/ic-documents/${DOC}?version=0`, 400);
    await get('mx1Accountant', `/api/ic-documents/${DOC}?scenarioId=x'or'1`, 400);
  });

  it('sin version devuelve la vigente (v2); pedir v1 no la sustituye y apaga canAccept', async () => {
    const current = await get('mx1Accountant', `/api/ic-documents/${VERSIONS}`, 200);
    expect(current.body).toMatchObject({
      icDocumentId: VERSIONS,
      version: 2,
      isCurrent: true,
      statusCode: 'PENDIENTE_ACEPTACION',
      permissions: { canAccept: true, canDispute: true },
    });
    expect(Number(current.body.transactionAmount)).toBe(2500);

    const v1 = await get('mx1Accountant', `/api/ic-documents/${VERSIONS}?version=1`, 200);
    expect(v1.body).toMatchObject({
      version: 1,
      isCurrent: false,
      statusCode: 'PENDIENTE_ACEPTACION',
      permissions: { canAccept: false, canDispute: false },
    });
    expect(Number(v1.body.transactionAmount)).toBe(1000);

    const v2 = await get('mx1Accountant', `/api/ic-documents/${VERSIONS}?version=2`, 200);
    expect(v2.body).toMatchObject({ version: 2, isCurrent: true, permissions: { canAccept: true, canDispute: true } });
  });
});
