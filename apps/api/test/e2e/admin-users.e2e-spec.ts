/**
 * OBJETIVO 2: panel de administración de usuarios (solo GROUP_CONTROLLER).
 * - GET /api/admin/users
 * - POST /api/admin/users (alta en Supabase Auth con SUPABASE_SECRET_KEY + userCompanyAccess; 409 si el correo ya existe)
 * - PATCH /api/admin/users/:id/access (cambiar rol/empresa o revocar)
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createApp } from '../../src/app.factory';
import { e2eConfig } from '../support/app';
import { asOwner } from '../support/claims-sql';
import { USERS, type UserKey } from '../support/fixtures';
import { startTestJwks, type TestJwks } from '../support/tokens';

const TEST_SECRET_KEY = 'sb_secret_test_only_server_key';

interface FakeGoTrueServer {
  url: string;
  receivedSecretKeys: string[];
  close: () => Promise<void>;
}

async function startFakeGoTrue(): Promise<FakeGoTrueServer> {
  const usersByEmail = new Map<string, { id: string; email: string; created_at: string }>();
  // Pre-poblar usuarios del fixture
  for (const u of Object.values(USERS)) {
    const email = `${u.id}@test.local`;
    usersByEmail.set(email.toLowerCase(), {
      id: u.id,
      email,
      created_at: new Date().toISOString(),
    });
  }
  const receivedSecretKeys: string[] = [];

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const apiKey = String(req.headers['apikey'] ?? '');
    const auth = String(req.headers['authorization'] ?? '');
    receivedSecretKeys.push(apiKey);

    if (apiKey !== TEST_SECRET_KEY || auth !== `Bearer ${TEST_SECRET_KEY}`) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ message: 'Invalid admin key' }));
      return;
    }

    const url = req.url ?? '';
    if (req.method === 'GET' && url.startsWith('/auth/v1/admin/users')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ users: [...usersByEmail.values()] }));
      return;
    }

    if (req.method === 'POST' && url === '/auth/v1/admin/users') {
      let raw = '';
      req.on('data', (chunk) => {
        raw += chunk;
      });
      req.on('end', () => {
        const body = JSON.parse(raw || '{}') as { email?: string; password?: string };
        const email = (body.email ?? '').trim().toLowerCase();
        if (usersByEmail.has(email)) {
          res.writeHead(422, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ msg: 'A user with this email address has already been registered' }));
          return;
        }
        const created = {
          id: randomUUID(),
          email,
          created_at: new Date().toISOString(),
        };
        usersByEmail.set(email, created);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(created));
      });
      return;
    }

    res.writeHead(404).end();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    receivedSecretKeys,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

describe('Administración de usuarios /api/admin/users (OBJETIVO 2)', () => {
  let app: NestExpressApplication;
  let jwks: TestJwks;
  let goTrue: FakeGoTrueServer;
  let createdUserId: string;

  const token = (user: UserKey) => jwks.sign(USERS[user].id);

  beforeAll(async () => {
    jwks = await startTestJwks();
    goTrue = await startFakeGoTrue();
    const baseConfig = e2eConfig(jwks);
    app = await createApp(
      {
        ...baseConfig,
        supabaseUrl: goTrue.url,
        supabaseSecretKey: TEST_SECRET_KEY,
      },
      { logger: false },
    );
    await app.init();
  });

  afterAll(async () => {
    if (createdUserId) {
      await asOwner((sql) => sql`delete from "userCompanyAccess" where "userId" = ${createdUserId}::uuid`);
      await asOwner((sql) => sql`delete from auth.users where id = ${createdUserId}::uuid`);
    }
    await app.close();
    await goTrue.close();
    await jwks.close();
  });

  it('401 sin token; 403 para AUDITOR, COMPANY_ACCOUNTANT, COMPANY_VIEWER y usuario sin grants', async () => {
    await request(app.getHttpServer()).get('/api/admin/users').expect(401);
    await request(app.getHttpServer()).post('/api/admin/users').send({}).expect(401);

    for (const role of ['auditor', 'gt1Accountant', 'gt1Viewer', 'noGrant'] as const) {
      const auth = `Bearer ${await token(role)}`;
      await request(app.getHttpServer()).get('/api/admin/users').set('Authorization', auth).expect(403);
      await request(app.getHttpServer())
        .post('/api/admin/users')
        .set('Authorization', auth)
        .send({
          email: 'intento@quadra.demo',
          password: 'Password123!',
          roleCode: 'AUDITOR',
          companyId: null,
        })
        .expect(403);
      await request(app.getHttpServer())
        .patch(`/api/admin/users/${USERS.gt1Viewer.id}/access`)
        .set('Authorization', auth)
        .send({ roleCode: 'COMPANY_ACCOUNTANT', companyId: 'GT1' })
        .expect(403);
    }
  });

  it('GET /api/admin/users devuelve los usuarios y sus accesos a GROUP_CONTROLLER', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${await token('controller')}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    const controllerEntry = res.body.find((u: { userId: string }) => u.userId === USERS.controller.id);
    expect(controllerEntry).toMatchObject({
      userId: USERS.controller.id,
      email: `${USERS.controller.id}@test.local`,
      roleCode: 'GROUP_CONTROLLER',
      companyId: null,
      isActive: true,
    });
  });

  it('POST /api/admin/users valida coherencia entre rol y empresa (400)', async () => {
    const auth = `Bearer ${await token('controller')}`;

    // Rol de grupo con companyId no nulo → 400
    await request(app.getHttpServer())
      .post('/api/admin/users')
      .set('Authorization', auth)
      .send({
        email: 'mal.grupo@quadra.demo',
        password: 'Password123!',
        roleCode: 'GROUP_CONTROLLER',
        companyId: 'GT1',
      })
      .expect(400);

    // Rol de empresa con companyId null → 400
    await request(app.getHttpServer())
      .post('/api/admin/users')
      .set('Authorization', auth)
      .send({
        email: 'mal.empresa@quadra.demo',
        password: 'Password123!',
        roleCode: 'COMPANY_ACCOUNTANT',
        companyId: null,
      })
      .expect(400);
  });

  it('POST /api/admin/users crea el usuario en Supabase Auth con SUPABASE_SECRET_KEY y le asigna acceso en userCompanyAccess', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${await token('controller')}`)
      .send({
        email: 'Nuevo.Contador.GT2@quadra.demo',
        password: 'TempPassword2026!',
        roleCode: 'COMPANY_ACCOUNTANT',
        companyId: 'GT2',
      })
      .expect(201);

    createdUserId = res.body.userId;
    expect(res.body).toMatchObject({
      email: 'nuevo.contador.gt2@quadra.demo',
      roleCode: 'COMPANY_ACCOUNTANT',
      companyId: 'GT2',
      isActive: true,
    });
    expect(goTrue.receivedSecretKeys).toContain(TEST_SECRET_KEY);

    // Auditoría: createdBy en userCompanyAccess es el GROUP_CONTROLLER real
    const [accessRow] = await asOwner(
      (sql) => sql<{ createdBy: string | null; roleCode: string; companyId: string | null }[]>`
        select "createdBy", "roleCode", "companyId"
          from "userCompanyAccess"
         where "userId" = ${createdUserId}::uuid`,
    );
    expect(accessRow).toEqual({
      createdBy: USERS.controller.id,
      roleCode: 'COMPANY_ACCOUNTANT',
      companyId: 'GT2',
    });
  });

  it('POST /api/admin/users devuelve 409 si el correo ya existe en Supabase Auth', async () => {
    await request(app.getHttpServer())
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${await token('controller')}`)
      .send({
        email: 'nuevo.contador.gt2@quadra.demo',
        password: 'TempPassword2026!',
        roleCode: 'AUDITOR',
        companyId: null,
      })
      .expect(409);
  });

  it('PATCH /api/admin/users/:id/access cambia rol/empresa y permite revocar el acceso', async () => {
    const auth = `Bearer ${await token('controller')}`;

    // Cambiar de COMPANY_ACCOUNTANT (GT2) a AUDITOR (grupo, companyId null)
    const promoted = await request(app.getHttpServer())
      .patch(`/api/admin/users/${createdUserId}/access`)
      .set('Authorization', auth)
      .send({ roleCode: 'AUDITOR', companyId: null })
      .expect(200);

    expect(promoted.body).toMatchObject({
      userId: createdUserId,
      roleCode: 'AUDITOR',
      companyId: null,
      isActive: true,
    });

    // Revocar acceso (isActive: false)
    const revoked = await request(app.getHttpServer())
      .patch(`/api/admin/users/${createdUserId}/access`)
      .set('Authorization', auth)
      .send({ isActive: false })
      .expect(200);

    expect(revoked.body.isActive).toBe(false);

    // Un usuario con acceso revocado recibe 403 en rutas de negocio
    const revokedUserToken = await jwks.sign(createdUserId);
    await request(app.getHttpServer())
      .get('/api/loads')
      .set('Authorization', `Bearer ${revokedUserToken}`)
      .expect(403);
  });
});
