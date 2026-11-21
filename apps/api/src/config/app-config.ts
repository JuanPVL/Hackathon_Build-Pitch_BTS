/**
 * Configuración del API leída de variables de entorno (ver .env.example).
 * Con el .env.example vacío el API arranca y responde el healthcheck; las rutas de
 * negocio fallan cerrado (401 sin verificador de JWT, 503 sin base de datos).
 */
/** Decisión de PM/Aroldo (21 nov 2026): el JWT de Supabase se valida solo con JWKS (signing keys). */
export type AuthConfig = { mode: 'jwks'; jwksUrl: string; issuer?: string } | { mode: 'unconfigured' };

export interface AppConfig {
  port: number;
  /** Allowlist de orígenes exactos (sin comodines). */
  corsOrigins: string[];
  databaseUrl?: string;
  /** Opcional (QB-19). Si falta, el API arranca igual; la narración del bridge queda deshabilitada. */
  anthropicApiKey?: string;
  /** URL base del proyecto Supabase (p. ej. https://<ref>.supabase.co). */
  supabaseUrl?: string;
  /** Secret key de Supabase (solo backend, nunca front) para Admin API de Auth. */
  supabaseSecretKey?: string;
  auth: AuthConfig;
}

export const APP_CONFIG = Symbol('APP_CONFIG');

function read(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const supabaseUrlRaw = read(env, 'SUPABASE_URL');
  const supabaseUrl = supabaseUrlRaw ? supabaseUrlRaw.replace(/\/+$/, '') : undefined;
  const issuer = supabaseUrl ? `${supabaseUrl}/auth/v1` : undefined;
  const jwksUrl = read(env, 'SUPABASE_JWKS_URL');
  const auth: AuthConfig = jwksUrl ? { mode: 'jwks', jwksUrl, issuer } : { mode: 'unconfigured' };

  const portRaw = read(env, 'PORT') ?? '8080'; // Cloud Run inyecta PORT
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port <= 0) throw new Error(`PORT inválido: ${portRaw}`);

  const corsOrigins = parseCorsOrigins(env);

  return {
    port,
    corsOrigins,
    databaseUrl: read(env, 'DATABASE_URL'),
    anthropicApiKey: read(env, 'ANTHROPIC_API_KEY'),
    supabaseUrl,
    supabaseSecretKey: read(env, 'SUPABASE_SECRET_KEY'),
    auth,
  };
}

/** Orígenes localhost habituales del front (Vite, preview y puertos de demo) cuando CORS_ORIGIN está vacío en desarrollo. */
export const DEV_LOCALHOST_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
] as const;

const CORS_EXAMPLE = 'http://localhost:5173,https://front.dominio';

/**
 * CORS_ORIGIN: lista de orígenes exactos separados por coma, sin "/" final ni comodines.
 * En producción (NODE_ENV=production) vacío o cualquier valor que contenga '*' impiden el arranque.
 * En desarrollo, si está vacío se permiten los orígenes localhost comunes.
 * Se rechaza también un origen como 'https://*.vercel.app', no solo el valor '*'.
 */
export function parseCorsOrigins(env: NodeJS.ProcessEnv): string[] {
  const isProduction = (env.NODE_ENV ?? '').trim() === 'production';
  const raw = env.CORS_ORIGIN?.trim() ?? '';
  const parts = raw
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  const hasWildcard = parts.some((o) => o.includes('*'));

  if (isProduction && (parts.length === 0 || hasWildcard)) {
    throw new Error(
      `En producción CORS_ORIGIN es obligatorio y debe ser una lista de orígenes exactos separados por coma (por ejemplo ${CORS_EXAMPLE}). No se admite vacío ni '*'.`,
    );
  }
  if (hasWildcard) {
    throw new Error(
      `CORS_ORIGIN no admite '*': usa orígenes exactos separados por coma (por ejemplo ${CORS_EXAMPLE}).`,
    );
  }
  return parts.length ? parts : [...DEV_LOCALHOST_ORIGINS];
}
