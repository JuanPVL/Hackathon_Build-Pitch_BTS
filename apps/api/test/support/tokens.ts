import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT, type KeyLike } from 'jose';

/** Emisor ficticio de pruebas (equivale a <SUPABASE_URL>/auth/v1). */
export const TEST_ISSUER = 'http://127.0.0.1:54321/auth/v1';

export interface TokenOptions {
  role?: string;
  aud?: string;
  issuer?: string;
  expiresIn?: string | number;
  /** 'other': ES256 con una clave que no está en el JWKS; 'hs256': secreto compartido (no aceptado). */
  key?: 'published' | 'other' | 'hs256';
}

export interface TestJwks {
  url: string;
  issuer: string;
  sign(sub: string, options?: TokenOptions): Promise<string>;
  close(): Promise<void>;
}

/**
 * JWKS local generado en cada corrida: par ES256 efímero publicado por un servidor HTTP en
 * 127.0.0.1, como el endpoint /auth/v1/.well-known/jwks.json de Supabase. Ninguna clave se guarda.
 */
export async function startTestJwks(): Promise<TestJwks> {
  const published = await generateKeyPair('ES256');
  const other = await generateKeyPair('ES256');
  const jwk = { ...(await exportJWK(published.publicKey)), kid: 'test-key', alg: 'ES256', use: 'sig' };
  const server = createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/auth/v1/.well-known/jwks.json`;

  const sign = (sub: string, options: TokenOptions = {}) => {
    const jwt = new SignJWT({ role: options.role ?? 'authenticated', email: `${sub}@test.local` })
      .setSubject(sub)
      .setAudience(options.aud ?? 'authenticated')
      .setIssuer(options.issuer ?? TEST_ISSUER)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 5)
      .setExpirationTime(options.expiresIn ?? '1h');
    if (options.key === 'hs256') {
      return jwt.setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).sign(new TextEncoder().encode('x'.repeat(32)));
    }
    const key: KeyLike = options.key === 'other' ? other.privateKey : published.privateKey;
    return jwt.setProtectedHeader({ alg: 'ES256', kid: 'test-key', typ: 'JWT' }).sign(key);
  };

  return {
    url,
    issuer: TEST_ISSUER,
    sign,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
