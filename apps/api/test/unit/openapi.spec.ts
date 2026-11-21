import request from 'supertest';
import { createApp } from '../../src/app.factory';
import { loadConfig } from '../../src/config/app-config';

/** OpenAPI público: /api/docs (Swagger UI) y /api/openapi.json, con bearer documentado. */
describe('OpenAPI', () => {
  it('GET /api/openapi.json y /api/docs responden 200 sin token; el documento declara bearer', async () => {
    const config = loadConfig({ CORS_ORIGIN: 'http://localhost:5173' });
    const app = await createApp(config, { logger: false });
    await app.init();
    try {
      const server = app.getHttpServer();
      const spec = await request(server).get('/api/openapi.json').expect(200);
      expect(spec.body.openapi).toMatch(/^3\./);
      expect(spec.body.paths['/api/health'] ?? spec.body.paths['/health']).toBeDefined();
      const schemes = spec.body.components?.securitySchemes ?? {};
      expect(schemes.bearer).toMatchObject({ type: 'http', scheme: 'bearer' });
      const health = (spec.body.paths['/api/health'] ?? spec.body.paths['/health']).get;
      expect(health.security).toEqual([]);

      const paths = spec.body.paths;
      const loadsPath = paths['/api/loads'] ?? paths['/loads'];
      expect(loadsPath?.get).toBeDefined();
      const loadsParams: Array<{ name: string; required?: boolean }> = loadsPath.get.parameters ?? [];
      const companyParam = loadsParams.find((p) => p.name === 'companyId');
      const scenarioParam = loadsParams.find((p) => p.name === 'scenarioId');
      expect(companyParam?.required).toBe(false);
      expect(scenarioParam?.required).toBe(false);
      const docPath = paths['/api/ic-documents/{icDocumentId}'] ?? paths['/ic-documents/{icDocumentId}'];
      const ratesPath = paths['/api/scenarios/{scenarioId}/rates'] ?? paths['/scenarios/{scenarioId}/rates'];
      const uploadPath = paths['/api/loads/upload'] ?? paths['/loads/upload'];
      const validatePath = paths['/api/loads/{loadId}/validate'] ?? paths['/loads/{loadId}/validate'];
      const approvePath = paths['/api/loads/{loadId}/approve'] ?? paths['/loads/{loadId}/approve'];
      const adminUsersPath = paths['/api/admin/users'] ?? paths['/admin/users'];
      const adminUserAccessPath = paths['/api/admin/users/{id}/access'] ?? paths['/admin/users/{id}/access'];
      expect(docPath?.get).toBeDefined();
      expect(ratesPath?.get).toBeDefined();
      expect(uploadPath?.post).toBeDefined();
      expect(validatePath?.post).toBeDefined();
      expect(approvePath?.post).toBeDefined();
      expect(adminUsersPath?.get).toBeDefined();
      expect(adminUsersPath?.post).toBeDefined();
      expect(adminUserAccessPath?.patch).toBeDefined();
      const schemas = spec.body.components?.schemas ?? {};
      expect(schemas.IcDocumentResponseDto).toBeDefined();
      expect(schemas.ScenarioRatesResponseDto).toBeDefined();
      expect(schemas.UploadLoadResponseDto).toBeDefined();
      expect(schemas.ValidateLoadResponseDto).toBeDefined();
      expect(schemas.ApproveLoadResponseDto).toBeDefined();
      expect(schemas.AdminUserDto).toBeDefined();
      expect(schemas.CreateAdminUserBodyDto).toBeDefined();
      expect(schemas.UpdateAdminUserAccessBodyDto).toBeDefined();

      const ui = await request(server).get('/api/docs').redirects(1).expect(200);
      expect(ui.text).toMatch(/swagger/i);
    } finally {
      await app.close();
    }
  });
});
