import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Resultados del oráculo (referencia/motor_referencia.py). Nunca se lee _respuestas/. */
export const ORACLE_DIR = join(__dirname, '../../../../hackathon-consolidacion/resultados_referencia');

/** CSV simple del oráculo (sin comillas ni comas en los valores; se verifica). */
export function readOracleCsv(name: string): Array<Record<string, string>> {
  const text = readFileSync(join(ORACLE_DIR, name), 'utf8').trim();
  if (text.includes('"')) throw new Error(`${name}: CSV con comillas no soportado`);
  const [header, ...lines] = text.split(/\r?\n/);
  const cols = header.split(',');
  return lines.map((line) => {
    const values = line.split(',');
    if (values.length !== cols.length) throw new Error(`${name}: fila con ${values.length} columnas`);
    return Object.fromEntries(cols.map((c, i) => [c, values[i]]));
  });
}

export const num = (value: unknown): number => Number(value ?? 0);
