/**
 * QB-12: aceptar o disputar un documento IC invocando las funciones SQL con el JWT del receptor.
 */
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { startApp } from '../support/app';
import { asOwner } from '../support/claims-sql';
import { USERS, type UserKey } from '../support/fixtures';
import { startTestJwks, type TestJwks } from '../support/tokens';

describe('Documentos IC: aceptar / disputar (QB-12)', () => {
  let app: NestExpressApplication;
  let jwks: TestJwks;

  const post = async (user: UserKey, path: string, body: object, expected: number) =>
    request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${await jwks.sign(USERS[user].id)}`).send(body).expect(expected);

  const status = async (id: string) => {
    const [row] = await asOwner((sql) => sql<{ statusCode: string; statusReason: string | null }[]>`
      select "statusCode", "statusReason" from "icDocument" where "icDocumentId" = ${id} and "version" = 1`);
    return row;
  };

  beforeAll(async () => {
    jwks = await startTestJwks();
    app = await startApp(jwks);
  });
  afterAll(async () => {
    await app.close();
    await jwks.close();
  });

  it('el emisor (GT1) no puede aceptar un documento cuyo receptor es MX1 → 403', async () => {
    await post('gt1Accountant', '/api/ic-documents/T-GT1-MX1-ACCEPT/accept', { version: 1 }, 403);
    await post('gt1Accountant', '/api/ic-documents/T-GT1-MX1-ACCEPT/dispute', { version: 1, reason: 'x' }, 403);
    expect((await status('T-GT1-MX1-ACCEPT')).statusCode).toBe('PENDIENTE_ACEPTACION');
  });

  it('un AUDITOR no acepta ni disputa → 403', async () => {
    await post('auditor', '/api/ic-documents/T-GT1-MX1-ACCEPT/accept', { version: 1 }, 403);
    await post('auditor', '/api/ic-documents/T-US1-MX1-DISPUTE/dispute', { version: 1, reason: 'x' }, 403);
  });

  it('un COMPANY_VIEWER del receptor no acepta → 403', async () => {
    await post('gt1Viewer', '/api/ic-documents/T-US2-GT1-VIEWER/accept', { version: 1 }, 403);
    expect((await status('T-US2-GT1-VIEWER')).statusCode).toBe('PENDIENTE_ACEPTACION');
  });

  it('el receptor (MX1) acepta: estado ACEPTADA y acceptedBy = su usuario (no null, no service_role)', async () => {
    const res = await post('mx1Accountant', '/api/ic-documents/T-GT1-MX1-ACCEPT/accept', { version: 1 }, 200);
    expect(res.body).toMatchObject({ icDocumentId: 'T-GT1-MX1-ACCEPT', version: 1, statusCode: 'ACEPTADA' });
    const [payable] = await asOwner((sql) => sql<{ acceptedBy: string | null }[]>`
      select "acceptedBy" from "icPayable" where "icDocumentId" = 'T-GT1-MX1-ACCEPT'`);
    expect(payable.acceptedBy).toBe(USERS.mx1Accountant.id);
  });

  it('el receptor (MX1) disputa con motivo: estado DISPUTADA', async () => {
    const res = await post('mx1Accountant', '/api/ic-documents/T-US1-MX1-DISPUTE/dispute', { version: 1, reason: 'Monto no coincide' }, 200);
    expect(res.body).toMatchObject({ statusCode: 'DISPUTADA', statusReason: 'Monto no coincide' });
  });

  it('documento que el usuario no ve (ajeno o BORRADOR del emisor) → 404', async () => {
    await post('gt1Accountant', '/api/ic-documents/T-US1-MX1-DISPUTE/accept', { version: 1 }, 404);
    await post('gt1Accountant', '/api/ic-documents/T-US1-GT1-DRAFT/accept', { version: 1 }, 404);
    expect((await status('T-US1-GT1-DRAFT')).statusCode).toBe('BORRADOR');
  });

  it('la máquina de estados manda: aceptar dos veces → 409', async () => {
    await post('gt1Accountant', '/api/ic-documents/T-MX1-GT1-TWICE/accept', { version: 1 }, 200);
    await post('gt1Accountant', '/api/ic-documents/T-MX1-GT1-TWICE/accept', { version: 1 }, 409);
    expect((await status('T-MX1-GT1-TWICE')).statusCode).toBe('ACEPTADA');
  });

  it('valida el cuerpo: version entera y motivo obligatorio → 400', async () => {
    await post('mx1Accountant', '/api/ic-documents/T-GT1-MX1-ACCEPT/accept', {}, 400);
    await post('mx1Accountant', '/api/ic-documents/T-GT1-MX1-ACCEPT/accept', { version: 'uno' }, 400);
    await post('gt1Accountant', '/api/ic-documents/T-US2-GT1-VIEWER/dispute', { version: 1 }, 400);
  });
});
