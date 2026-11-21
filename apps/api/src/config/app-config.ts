/**
 * Configuración del API leída de variables de entorno (ver .env.example).
 * Con el .env.example vacío el API arranca y responde el healthcheck; las rutas de
 * negocio fallan cerrado (401 sin verificador de JWT, 503 sin base de datos).
 */
/** Decisión de PM/Aroldo (21 nov 2026): el JWT de Supabase se valida solo con JWKS (signing keys). */
export type AuthConfig = { mode: 'jwks'; jwksUrl: string; issuer?: string } | { mode: 'unconfigured' };

export interface AppConfig {
  port: number;
  /** '*' = cualquier origen; si no, allowlist exacta. */
  corsOrigins: string[] | '*';
  databaseUrl?: string;
  auth: AuthConfig;
}

export const APP_CONFIG = Symbol('APP_CONFIG');

function read(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const supabaseUrl = read(env, 'SUPABASE_URL');
  const issuer = supabaseUrl ? `${supabaseUrl.replace(/\/$/, '')}/auth/v1` : undefined;
  const jwksUrl = read(env, 'SUPABASE_JWKS_URL');
  const auth: AuthConfig = jwksUrl ? { mode: 'jwks', jwksUrl, issuer } : { mode: 'unconfigured' };

  const portRaw = read(env, 'PORT') ?? '8080'; // Cloud Run inyecta PORT
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port <= 0) throw new Error(`PORT inválido: ${portRaw}`);

  // CORS_ORIGIN: "*" (por defecto, abierto para la demo) o lista de orígenes exactos separados por coma.
  const corsRaw = read(env, 'CORS_ORIGIN') ?? '*';
  const corsOrigins: string[] | '*' =
    corsRaw === '*'
      ? '*'
      : corsRaw
          .split(',')
          .map((o) => o.trim().replace(/\/+$/, ''))
          .filter(Boolean);

  return { port, corsOrigins, databaseUrl: read(env, 'DATABASE_URL'), auth };
}
