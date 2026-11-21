import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../../src/config/app-config';

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
      ].sort(),
    );
    expect(Object.values(example).every((v) => v === '')).toBe(true);
  });

  it('con solo el example el API arranca en modo seguro (sin verificador ni base)', () => {
    const config = loadConfig(example as NodeJS.ProcessEnv);
    expect(config).toEqual({ port: 8080, corsOrigins: '*', databaseUrl: undefined, auth: { mode: 'unconfigured' } });
  });
});

describe('.gitignore (QB-02)', () => {
  it('ignora .env, .DS_Store, node_modules y dist pero no el example', () => {
    const lines = readFileSync(join(repoRoot, '.gitignore'), 'utf8').split('\n').map((l) => l.trim());
    for (const entry of ['.env', '.env.*', '!.env.example', '.DS_Store', 'node_modules/', 'dist/']) {
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

  it('CORS_ORIGIN: "*" por defecto o allowlist sin "/" final; PORT inválido falla', () => {
    expect(loadConfig({}).corsOrigins).toBe('*');
    expect(loadConfig({ CORS_ORIGIN: 'http://a.test/, http://b.test' }).corsOrigins).toEqual(['http://a.test', 'http://b.test']);
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/PORT/);
  });
});
