import { InvalidTokenError, JwtVerifier } from '../../src/auth/jwt-verifier';
import { startTestJwks, type TestJwks } from '../support/tokens';

const SUB = '00000000-0000-4000-8000-000000000001';

/** QB-05 criterios 1 y 5: verificación por JWKS (decisión del 21 nov 2026). */
describe('JwtVerifier (JWKS)', () => {
  let jwks: TestJwks;
  let verifier: JwtVerifier;

  beforeAll(async () => {
    jwks = await startTestJwks();
    verifier = new JwtVerifier({ mode: 'jwks', jwksUrl: jwks.url, issuer: jwks.issuer });
  });
  afterAll(() => jwks.close());

  it('acepta un ES256 de authenticated firmado con la clave publicada y devuelve sub + claims', async () => {
    const user = await verifier.verify(await jwks.sign(SUB));
    expect(user.userId).toBe(SUB);
    expect(user.claims).toMatchObject({ sub: SUB, role: 'authenticated', aud: 'authenticated', iss: jwks.issuer });
  });

  it.each([
    ['rol anon', { role: 'anon' }],
    ['rol service_role', { role: 'service_role' }],
    ['expirado', { expiresIn: Math.floor(Date.now() / 1000) - 1 }],
    ['firmado con una clave fuera del JWKS', { key: 'other' as const }],
    ['HS256 con secreto compartido', { key: 'hs256' as const }],
    ['otra audiencia', { aud: 'service' }],
    ['otro emisor', { issuer: 'https://evil.supabase.co/auth/v1' }],
  ])('rechaza %s', async (_label, options) => {
    await expect(verifier.verify(await jwks.sign(SUB, options))).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('rechaza sub que no es UUID, alg none y basura', async () => {
    await expect(verifier.verify(await jwks.sign('no-uuid'))).rejects.toBeInstanceOf(InvalidTokenError);
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ sub: SUB, role: 'authenticated', aud: 'authenticated', exp: 9999999999 })).toString('base64url');
    await expect(verifier.verify(`${header}.${body}.`)).rejects.toBeInstanceOf(InvalidTokenError);
    await expect(verifier.verify('no-es-un-jwt')).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('sin SUPABASE_JWKS_URL rechaza todo (falla cerrado)', async () => {
    const off = new JwtVerifier({ mode: 'unconfigured' });
    await expect(off.verify(await jwks.sign(SUB))).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('si el JWKS no responde, el token se rechaza (no se acepta sin verificar)', async () => {
    const down = new JwtVerifier({ mode: 'jwks', jwksUrl: 'http://127.0.0.1:9/jwks.json', issuer: jwks.issuer });
    await expect(down.verify(await jwks.sign(SUB))).rejects.toBeInstanceOf(InvalidTokenError);
  });
});
