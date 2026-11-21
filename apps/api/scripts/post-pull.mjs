// Post-proceso de `drizzle-kit pull` (casing preserve).
// 1) drizzle-kit 0.31 emite el nombre de las secuencias identity con comillas sin escapar
//    (p. ej. name: ""lineage_lineageId_seq""), que no compila. Aquí se escapan.
// 2) Se borran el .sql, meta/ y relations.ts que genera el pull: el DDL vive en los scripts SQL numerados,
//    Drizzle no es dueño de las migraciones.
import { readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = new URL('../src/db/schema/', import.meta.url).pathname;
const file = join(dir, 'schema.ts');
const src = readFileSync(file, 'utf8');
let fixed = src.replace(/AsIdentity\(\{ name: "(.*?)", startWith/g, (_m, raw) => `AsIdentity({ name: ${JSON.stringify(raw)}, startWith`);

// 3) Defaults con expresiones SQL que drizzle-kit emite sin envolver en sql`` (audit."changeLog").
//    Solo afectan al DDL (que Drizzle nunca aplica aquí); se reescriben con el texto real de 01_schema.sql.
const knownDefaults = [
  ['.default(CURRENT_USER)', '.default(sql`current_user`)'],
  [
    ".default(NULLIF(current_setting(\\'app.change_reason\\'::text, true), \\'::text))",
    ".default(sql`nullif(current_setting('app.change_reason', true), '')`)",
  ],
];
for (const [broken, ok] of knownDefaults) fixed = fixed.split(broken).join(ok);
const allowed = /^\.default\((sql`|true\)|false\)|'|-?\d)/;
const leftovers = [...fixed.matchAll(/\.default\([^\n]*/g)].map((m) => m[0]).filter((d) => !allowed.test(d));
if (leftovers.length) {
  console.error('Defaults no reconocidos tras el pull (revisar post-pull.mjs):\n' + leftovers.join('\n'));
  process.exit(1);
}
// 4) Policies: drizzle-kit 0.31 pierde expresiones (p. ej. el USING de "pReadOwn"). Las policies
//    viven solo en 05_security_rls.sql; aquí se quitan para que nadie lea una versión incompleta.
fixed = fixed.replace(/^\s*pgPolicy\([\s\S]*?\}\),\n/gm, '').replace(/pgPolicy, /, '');
// 5) FK a auth.users (esquema de Supabase fuera de schemaFilter): el pull la deja apuntando a un
//    símbolo inexistente. La integridad la garantiza la base; en TypeScript se omite.
fixed = fixed.replace(/\tforeignKey\(\{\n\t\t\tcolumns: \[table\.userId\],\n\t\t\tforeignColumns: \[users\.id\],\n[^\n]*\n[^\n]*\n/g, '');
if (/pgPolicy|\busers\.id\b/.test(fixed)) {
  console.error('Quedaron policies o referencias a auth.users en schema.ts (revisar post-pull.mjs)');
  process.exit(1);
}
writeFileSync(file, fixed);
// relations.ts sale con claves duplicadas y no se usa (no hay queries relacionales): se borra.
for (const entry of readdirSync(dir)) {
  if (entry.endsWith('.sql') || entry === 'meta' || entry === 'relations.ts') rmSync(join(dir, entry), { recursive: true, force: true });
}
console.log('schema.ts post-procesado');
