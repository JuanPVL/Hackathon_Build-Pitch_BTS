import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import type { AuthConfig } from '../config/app-config';

export interface VerifiedUser {
  userId: string;
  /** Payload completo del JWT verificado; se copia a request.jwt.claims en cada transacción. */
  claims: JWTPayload & { sub: string; role: 'authenticated' };
}

export class InvalidTokenError extends Error {}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Supabase emite los access tokens de usuario con aud = "authenticated". */
const AUDIENCE = 'authenticated';
/** Algoritmos asimétricos de las signing keys de Supabase. HS256 (secreto compartido) no se acepta. */
const ALGORITHMS = ['ES256', 'RS256'];

/**
 * Verifica access tokens de Supabase Auth contra el JWKS del proyecto (SUPABASE_JWKS_URL).
 * Las claves se cachean (máx. 10 min) y se recargan solas cuando aparece un `kid` nuevo.
 * Rechaza tokens cuyo `role` no sea `authenticated` (anon, service_role, etc.).
 * Sin SUPABASE_JWKS_URL falla cerrado: todo token es inválido.
 */
export class JwtVerifier {
  private readonly jwks?: JWTVerifyGetKey;
  private readonly issuer?: string;

  constructor(config: AuthConfig) {
    if (config.mode === 'jwks') {
      this.jwks = createRemoteJWKSet(new URL(config.jwksUrl), { cacheMaxAge: 10 * 60 * 1000 });
      this.issuer = config.issuer;
    }
  }

  async verify(token: string): Promise<VerifiedUser> {
    if (!this.jwks) throw new InvalidTokenError('Verificación de JWT no configurada');
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, this.jwks, {
        algorithms: ALGORITHMS,
        audience: AUDIENCE,
        issuer: this.issuer,
        requiredClaims: ['exp', 'sub'],
      }));
    } catch {
      throw new InvalidTokenError('Token inválido o expirado');
    }
    if (payload.role !== 'authenticated') throw new InvalidTokenError('El token no es de un usuario autenticado');
    if (typeof payload.sub !== 'string' || !UUID_RE.test(payload.sub)) throw new InvalidTokenError('sub inválido');
    return { userId: payload.sub, claims: payload as VerifiedUser['claims'] };
  }
}
