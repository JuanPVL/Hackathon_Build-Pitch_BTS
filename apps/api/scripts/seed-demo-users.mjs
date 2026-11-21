#!/usr/bin/env node
/**
 * QB-04 — Alta idempotente de usuarios demo en Supabase Auth y emisión del SQL
 * de "userCompanyAccess". No imprime contraseñas ni tokens.
 *
 * Uso:
 *   node scripts/seed-demo-users.mjs              # crea/encuentra usuarios y emite el SQL
 *   node scripts/seed-demo-users.mjs tokens       # inicia sesión y escribe tokens.env
 *   node scripts/seed-demo-users.mjs local-test   # prueba el SQL dos veces en Postgres local
 *
 * Claves (nunca van a git ni a stdout):
 *   ~/.quadra/supabase_secret_key
 *   ~/.quadra/supabase_publishable_key
 *   ~/.quadra/supabase_url  o  SUPABASE_URL  o  apps/api/.env
 *
 * Artefactos locales (gitignored, chmod 600):
 *   apps/api/.demo-users.json
 *   apps/api/.demo-user-company-access.sql
 *   /home/box/quadra/qa/tokens.env
 */

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_ROOT = join(__dirname, '..');
const CREDS_PATH = join(API_ROOT, '.demo-users.json');
const SQL_PATH = join(API_ROOT, '.demo-user-company-access.sql');
const TOKENS_PATH = process.env.QUADRA_TOKENS_PATH || '/home/box/quadra/qa/tokens.env';
const LOCAL_PG = {
  host: '127.0.0.1',
  port: '54329',
  user: 'postgres',
  db: process.env.LOCAL_SEED_DB || 'quadra_dev',
};

const DEMO_USERS = [
  {
    key: 'GROUP_CONTROLLER',
    email: 'demo.group.controller@quadra.demo',
    roleCode: 'GROUP_CONTROLLER',
    companyId: null,
    tokenName: 'TOKEN_GROUP_CONTROLLER',
  },
  {
    key: 'AUDITOR',
    email: 'demo.auditor@quadra.demo',
    roleCode: 'AUDITOR',
    companyId: null,
    tokenName: 'TOKEN_AUDITOR',
  },
  {
    key: 'COMPANY_ACCOUNTANT',
    email: 'demo.company.accountant.gt1@quadra.demo',
    roleCode: 'COMPANY_ACCOUNTANT',
    companyId: 'GT1',
    tokenName: 'TOKEN_COMPANY_ACCOUNTANT',
  },
  {
    key: 'COMPANY_VIEWER',
    email: 'demo.company.viewer.mx1@quadra.demo',
    roleCode: 'COMPANY_VIEWER',
    companyId: 'MX1',
    tokenName: 'TOKEN_COMPANY_VIEWER',
  },
];

function readTrimmed(path) {
  if (!existsSync(path)) return null;
  const value = readFileSync(path, 'utf8').trim();
  return value || null;
}

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const cut = line.indexOf('=');
    if (cut <= 0) continue;
    const key = line.slice(0, cut).trim();
    let value = line.slice(cut + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function resolveSupabaseUrl() {
  const fromEnv = process.env.SUPABASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  const fromFile = readTrimmed(join(homedir(), '.quadra', 'supabase_url'));
  if (fromFile) return fromFile.replace(/\/+$/, '');
  const fromDotenv = readEnvFile(join(API_ROOT, '.env')).SUPABASE_URL?.trim();
  if (fromDotenv) return fromDotenv.replace(/\/+$/, '');
  return null;
}

function resolveKey(envName, fileName) {
  const fromEnv = process.env[envName]?.trim();
  if (fromEnv) return fromEnv;
  return readTrimmed(join(homedir(), '.quadra', fileName));
}

function writePrivate(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, contents, { encoding: 'utf8', mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, path);
  chmodSync(path, 0o600);
}

function generatePassword() {
  return `Qd1!${randomBytes(24).toString('base64url')}`;
}

function loadCreds() {
  if (!existsSync(CREDS_PATH)) return { users: [] };
  try {
    const parsed = JSON.parse(readFileSync(CREDS_PATH, 'utf8'));
    return { users: Array.isArray(parsed.users) ? parsed.users : [] };
  } catch {
    throw new Error('No se pudo leer el archivo local de credenciales (JSON inválido).');
  }
}

function saveCreds(users) {
  writePrivate(
    CREDS_PATH,
    `${JSON.stringify({ updatedAt: new Date().toISOString(), users }, null, 2)}\n`,
  );
}

function sqlLiteral(value) {
  if (value === null) return 'null';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function renderAccessSql(users) {
  const values = users
    .map((u) => `  (${sqlLiteral(u.userId)}::uuid, ${sqlLiteral(u.companyId)}, ${sqlLiteral(u.roleCode)})`)
    .join(',\n');
  return `-- Generado por scripts/seed-demo-users.mjs (QB-04).
-- Idempotente gracias a unique nulls not distinct ("userId", "companyId", "roleCode").
-- Aplicar SOLO este INSERT. No toca corridas ni el seed 06.

begin;

insert into "userCompanyAccess" ("userId", "companyId", "roleCode")
values
${values}
on conflict ("userId", "companyId", "roleCode") do nothing;

commit;
`;
}

function writeSql(users) {
  const missing = users.filter((u) => !u.userId);
  if (missing.length) {
    throw new Error(`Falta userId para: ${missing.map((u) => u.email).join(', ')}`);
  }
  writePrivate(SQL_PATH, renderAccessSql(users));
}

async function adminRequest(url, secretKey, path, { method = 'GET', body } = {}) {
  const res = await fetch(`${url}${path}`, {
    method,
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json };
}

function usersFromList(json) {
  if (!json) return [];
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.users)) return json.users;
  return [];
}

async function findUserByEmail(url, secretKey, email) {
  const q = new URLSearchParams({ page: '1', per_page: '200', filter: email });
  const listed = await adminRequest(url, secretKey, `/auth/v1/admin/users?${q}`);
  if (!listed.ok) {
    throw new Error(`No se pudo listar usuarios de Auth (HTTP ${listed.status}).`);
  }
  const found = usersFromList(listed.json).find((u) => u.email?.toLowerCase() === email.toLowerCase());
  return found ?? null;
}

async function createOrFindUser(url, secretKey, email, password) {
  const created = await adminRequest(url, secretKey, '/auth/v1/admin/users', {
    method: 'POST',
    body: { email, password, email_confirm: true },
  });
  if (created.ok && created.json?.id) {
    return { user: created.json, created: true };
  }
  const already =
    created.status === 422 ||
    created.status === 409 ||
    /already|registered|exists/i.test(JSON.stringify(created.json ?? {}));
  if (already) {
    const existing = await findUserByEmail(url, secretKey, email);
    if (!existing?.id) {
      throw new Error(`El usuario ${email} ya existía en Auth, pero no se pudo obtener su id.`);
    }
    return { user: existing, created: false };
  }
  throw new Error(`No se pudo crear ${email} (HTTP ${created.status}).`);
}

function requireAuthConfig() {
  const supabaseUrl = resolveSupabaseUrl();
  const secretKey = resolveKey('SUPABASE_SECRET_KEY', 'supabase_secret_key');
  const publishableKey = resolveKey('SUPABASE_PUBLISHABLE_KEY', 'supabase_publishable_key');
  const missing = [];
  if (!supabaseUrl) missing.push('SUPABASE_URL (~/.quadra/supabase_url)');
  if (!secretKey) missing.push('SUPABASE_SECRET_KEY (~/.quadra/supabase_secret_key)');
  if (!publishableKey) missing.push('SUPABASE_PUBLISHABLE_KEY (~/.quadra/supabase_publishable_key)');
  if (missing.length) {
    throw new Error(`Faltan claves o URL: ${missing.join(', ')}. El script está listo y queda bloqueado.`);
  }
  return { supabaseUrl, secretKey, publishableKey };
}

async function seedUsers() {
  const { supabaseUrl, secretKey } = requireAuthConfig();
  const stored = loadCreds();
  const next = [];

  for (const spec of DEMO_USERS) {
    const previous = stored.users.find((u) => u.email === spec.email);
    const existing = await findUserByEmail(supabaseUrl, secretKey, spec.email);
    let userId = existing?.id ?? previous?.userId ?? null;
    let password = previous?.password ?? null;
    let created = false;

    if (!existing) {
      if (!password) password = generatePassword();
      const result = await createOrFindUser(supabaseUrl, secretKey, spec.email, password);
      userId = result.user.id;
      created = result.created;
      if (!result.created && !previous?.password) {
        password = previous?.password ?? null;
      }
    }

    next.push({
      key: spec.key,
      email: spec.email,
      roleCode: spec.roleCode,
      companyId: spec.companyId,
      tokenName: spec.tokenName,
      userId,
      password,
      createdNow: created,
      alreadyInAuth: Boolean(existing) || !created,
    });
    const action = existing || !created ? 'encontrado' : 'creado';
    console.log(`${action}: ${spec.email} (${spec.roleCode}${spec.companyId ? `, ${spec.companyId}` : ', companyId null'})`);
  }

  saveCreds(next.map(({ createdNow, alreadyInAuth, ...rest }) => rest));
  writeSql(next);
  console.log(`Credenciales locales escritas (chmod 600, fuera de git).`);
  console.log(`SQL idempotente de userCompanyAccess emitido (chmod 600, fuera de git).`);
  const withoutPassword = next.filter((u) => !u.password).map((u) => u.email);
  if (withoutPassword.length) {
    console.log(
      `Aviso: no hay contraseña local para ${withoutPassword.join(', ')} (ya existían). No se rota. El modo tokens no podrá iniciar su sesión.`,
    );
  }
  return next;
}

async function issueTokens() {
  const { supabaseUrl, publishableKey } = requireAuthConfig();
  const stored = loadCreds();
  if (!stored.users.length) {
    throw new Error('No hay credenciales locales. Corre primero el alta (sin argumento tokens).');
  }

  const lines = ['# Tokens de usuarios demo para QA. chmod 600. No versionar ni pegar en el chat.'];
  for (const spec of DEMO_USERS) {
    const rec = stored.users.find((u) => u.email === spec.email);
    if (!rec?.password) {
      throw new Error(`No hay contraseña local para ${spec.email}; no se puede iniciar sesión sin rotarla.`);
    }
    const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: spec.email, password: rec.password }),
    });
    let json = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    const token = json?.access_token;
    if (!res.ok || !token) {
      throw new Error(`Login falló para ${spec.email} (HTTP ${res.status}).`);
    }
    lines.push(`${spec.tokenName}=${token}`);
  }
  writePrivate(TOKENS_PATH, `${lines.join('\n')}\n`);
  console.log(`Tokens escritos en ${TOKENS_PATH} (chmod 600). No se imprimen.`);
}

function runPsql(args, input) {
  const result = spawnSync(
    'psql',
    ['-h', LOCAL_PG.host, '-p', LOCAL_PG.port, '-U', LOCAL_PG.user, '-d', LOCAL_PG.db, '-v', 'ON_ERROR_STOP=1', ...args],
    {
      encoding: 'utf8',
      input,
      env: { ...process.env },
    },
  );
  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || 'psql falló').trim();
    throw new Error(err.split('\n').slice(-8).join('\n'));
  }
  return (result.stdout || '').trim();
}

function psql(sql) {
  return runPsql(['-tAc', sql]);
}

function psqlFile(path) {
  return runPsql(['-f', path, '-q']);
}

function ensureLocalSqlAndUsers() {
  let users = loadCreds().users.filter((u) => u.userId);
  if (users.length !== DEMO_USERS.length) {
    users = DEMO_USERS.map((spec, i) => ({
      ...spec,
      userId: `00000000-0000-4000-8000-00c20400000${i + 1}`,
    }));
    writeSql(users);
    console.log('SQL de prueba emitido con UUIDs locales (no son los de Auth).');
  } else {
    writeSql(users);
  }
  return users;
}

function localTest() {
  const users = ensureLocalSqlAndUsers();
  const values = users
    .map((u) => `(${sqlLiteral(u.userId)}::uuid, ${sqlLiteral(u.email)})`)
    .join(', ');
  psql(`insert into auth.users (id, email) values ${values}
     on conflict (id) do update set email = excluded.email;`);

  const count = () => psql('select count(*) from public."userCompanyAccess"');
  const before = Number(count());
  psqlFile(SQL_PATH);
  const mid = Number(count());
  psqlFile(SQL_PATH);
  const after = Number(count());
  if (after !== mid) {
    throw new Error(`El SQL no es idempotente: ${mid} filas tras la 1ª aplicación, ${after} tras la 2ª.`);
  }
  const expected = users.length;
  let ok = 0;
  for (const u of users) {
    const n = Number(
      psql(
        `select count(*) from public."userCompanyAccess"
          where "userId" = ${sqlLiteral(u.userId)}::uuid
            and "roleCode" = ${sqlLiteral(u.roleCode)}
            and "companyId" is not distinct from ${sqlLiteral(u.companyId)}`,
      ),
    );
    if (n !== 1) {
      throw new Error(`Se esperaba 1 fila de acceso para ${u.email} (${u.roleCode}), hay ${n}.`);
    }
    ok += 1;
  }
  console.log(
    `Postgres local ${LOCAL_PG.host}:${LOCAL_PG.port}/${LOCAL_PG.db}: SQL aplicado dos veces. Filas userCompanyAccess: ${before} → ${mid} → ${after}. Accesos demo verificados: ${ok}/${expected}. Idempotente: sí.`,
  );
}

function usage() {
  console.log(`Uso: node scripts/seed-demo-users.mjs [tokens|local-test]`);
}

const command = process.argv[2] ?? 'seed';

try {
  if (command === 'seed' || command === undefined) {
    await seedUsers();
  } else if (command === 'tokens') {
    await issueTokens();
  } else if (command === 'local-test') {
    localTest();
  } else if (command === '-h' || command === '--help') {
    usage();
  } else {
    usage();
    process.exitCode = 2;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
