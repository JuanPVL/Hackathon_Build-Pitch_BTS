import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { DbModule } from '../../src/db/db.module';
import { UserDb } from '../../src/db/user-db';

const srcDir = join(__dirname, '../../src');

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? tsFiles(path) : path.endsWith('.ts') ? [path] : [];
  });
}

/** QB-03 criterio 4: el migrador / service_role nunca atiende un request HTTP. */
describe('Separación de clientes de base', () => {
  it('ningún archivo de src/ (salvo el propio migrador) importa el cliente migrador', () => {
    const offenders = tsFiles(srcDir)
      .filter((f) => !f.endsWith(join('db', 'migrator-client.ts')))
      .filter((f) => /migrator-client/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(srcDir, f));
    expect(offenders).toEqual([]);
  });

  it('el código del API no lee la secret key ni la service_role key de Supabase', () => {
    const offenders = tsFiles(srcDir)
      .filter((f) => /SUPABASE_SECRET_KEY|SERVICE_ROLE_KEY|service_role_key/i.test(readFileSync(f, 'utf8')))
      .map((f) => relative(srcDir, f));
    expect(offenders).toEqual([]);
  });

  it('el módulo de base de Nest solo provee el cliente de usuario', () => {
    const providers = Reflect.getMetadata('providers', DbModule);
    expect(providers).toEqual([UserDb]);
  });

  it('el cliente de usuario fija claims y SET LOCAL ROLE authenticated antes del trabajo', () => {
    const source = readFileSync(join(srcDir, 'db', 'user-db.ts'), 'utf8');
    const sub = source.indexOf("set_config('request.jwt.claim.sub'");
    const claims = source.indexOf("set_config('request.jwt.claims'");
    const role = source.indexOf('set local role authenticated');
    const work = source.indexOf('return work(tx)');
    expect(sub).toBeGreaterThan(0);
    expect(claims).toBeGreaterThan(sub);
    expect(role).toBeGreaterThan(claims);
    expect(work).toBeGreaterThan(role);
  });

  it('no hay usos de drizzle-kit push / migrate / generate en los scripts', () => {
    const pkg = JSON.parse(readFileSync(join(srcDir, '..', 'package.json'), 'utf8'));
    expect(Object.values(pkg.scripts).join(' ')).not.toMatch(/drizzle-kit (push|migrate|generate)/);
  });
});
