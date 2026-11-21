import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEV_LOCALHOST_ORIGINS, loadConfig } from '../../src/config/app-config';

const apiRoot = join(__dirname, '../..');
const repoRoot = join(apiRoot, '../..');

/** Parseo mínimo de un .env (KEY=valor, comentarios con #). */
export function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2];
  }
  return out;
}

describe('.env.example (QB-02)', () => {
  const example = parseEnvFile(join(apiRoot, '.env.example'));

  it('declara exactamente las variables acordadas, todas vacías', () => {
    expect(Object.keys(example).sort()).toEqual(
      [
        'SUPABASE_URL',
        'SUPABASE_PUBLISHABLE_KEY',
        'SUPABASE_SECRET_KEY',
        'SUPABASE_JWKS_URL',
        'DATABASE_URL',
        'ANTHROPIC_API_KEY',
        'CORS_ORIGIN',
      ].sort(),
    );
    expect(Object.values(example).every((v) => v === '')).toBe(true);
  });

  it('con solo el example el API arranca en modo seguro (sin verificador ni base)', () => {
    const config = loadConfig(example as NodeJS.ProcessEnv);
    expect(config.auth).toEqual({ mode: 'unconfigured' });
    expect(config.databaseUrl).toBeUndefined();
    expect(config.port).toBe(8080);
    expect(config.corsOrigins).toEqual([...DEV_LOCALHOST_ORIGINS]);
    expect(config.anthropicApiKey).toBeUndefined();
  });

  it('ANTHROPIC_API_KEY es opcional: el API arranca sin ella y la lee si está', () => {
    expect(loadConfig({ NODE_ENV: 'production', CORS_ORIGIN: 'https://front.dominio' }).anthropicApiKey).toBeUndefined();
    expect(loadConfig({ ANTHROPIC_API_KEY: 'sk-test' }).anthropicApiKey).toBe('sk-test');
  });
});

describe('.gitignore (QB-02)', () => {
  it('ignora .env, .DS_Store, node_modules y dist pero no el example', () => {
    const lines = readFileSync(join(repoRoot, '.gitignore'), 'utf8').split('\n').map((l) => l.trim());
    for (const entry of ['.env', '.env.*', '!.env.example', '.DS_Store', '.local/', 'node_modules/', 'dist/']) {
      expect(lines).toContain(entry);
    }
  });
});

describe('loadConfig', () => {
  it('usa JWKS con el emisor derivado de SUPABASE_URL; sin JWKS queda sin configurar', () => {
    expect(loadConfig({ SUPABASE_URL: 'https://ref.supabase.co/', SUPABASE_JWKS_URL: 'https://ref.supabase.co/auth/v1/.well-known/jwks.json' }).auth).toEqual({
      mode: 'jwks',
      jwksUrl: 'https://ref.supabase.co/auth/v1/.well-known/jwks.json',
      issuer: 'https://ref.supabase.co/auth/v1',
    });
    expect(loadConfig({ SUPABASE_URL: 'https://ref.supabase.co' }).auth).toEqual({ mode: 'unconfigured' });
  });

  it('parsea una lista de orígenes exactos separados por coma y quita el "/" final', () => {
    expect(loadConfig({ CORS_ORIGIN: 'http://localhost:5173, https://front.dominio/' }).corsOrigins).toEqual([
      'http://localhost:5173',
      'https://front.dominio',
    ]);
  });

  it('en desarrollo, CORS_ORIGIN vacío usa los orígenes localhost comunes', () => {
    expect(loadConfig({}).corsOrigins).toEqual([...DEV_LOCALHOST_ORIGINS]);
    expect(loadConfig({ NODE_ENV: 'development', CORS_ORIGIN: '' }).corsOrigins).toEqual([...DEV_LOCALHOST_ORIGINS]);
  });

  it("en producción no arranca si CORS_ORIGIN está vacío o contiene '*'", () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/En producción CORS_ORIGIN/);
    expect(() => loadConfig({ NODE_ENV: 'production', CORS_ORIGIN: '' })).toThrow(/En producción CORS_ORIGIN/);
    expect(() => loadConfig({ NODE_ENV: 'production', CORS_ORIGIN: '*' })).toThrow(/En producción CORS_ORIGIN/);
    expect(() => loadConfig({ NODE_ENV: 'production', CORS_ORIGIN: 'http://localhost:5173,*' })).toThrow(/En producción CORS_ORIGIN/);
  });

  it("también rechaza '*' fuera de producción", () => {
    expect(() => loadConfig({ CORS_ORIGIN: '*' })).toThrow(/no admite/);
  });

  it("rechaza cualquier CORS_ORIGIN que contenga '*', no solo el valor exacto '*'", () => {
    expect(() => loadConfig({ CORS_ORIGIN: 'https://*.vercel.app' })).toThrow(/no admite/);
    expect(() => loadConfig({ CORS_ORIGIN: 'http://localhost:5173,https://*.vercel.app' })).toThrow(/no admite/);
    expect(() =>
      loadConfig({ NODE_ENV: 'production', CORS_ORIGIN: 'https://hackathon-build-pitch-bts.vercel.app,https://*.vercel.app' }),
    ).toThrow(/En producción CORS_ORIGIN|no admite/);
  });

  it('en producción arranca con una allowlist exacta; PORT inválido falla', () => {
    expect(loadConfig({ NODE_ENV: 'production', CORS_ORIGIN: 'https://front.dominio' }).corsOrigins).toEqual(['https://front.dominio']);
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/PORT/);
  });
});
