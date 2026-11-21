import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';

export const MAX_CSV_BYTES = 5 * 1024 * 1024; // 5 MB

export const EXPECTED_CSV_HEADERS = [
  'empresa',
  'escenario',
  'periodo',
  'cuenta_local',
  'descripcion',
  'moneda',
  'monto',
  'socio_ic',
  'doc_ic_id',
  'moneda_tx',
  'monto_tx',
  'contraparte_id_fiscal',
  'volumen',
  'precio',
] as const;

export type CsvColumnName = (typeof EXPECTED_CSV_HEADERS)[number];

export interface ParsedCsvLine {
  rowNumber: number;
  companyCode: string | null;
  scenarioCode: string | null;
  periodCode: string | null;
  localAccountCode: string | null;
  description: string | null;
  currencyCode: string | null;
  amount: string | null;
  icPartnerCode: string | null;
  icDocumentId: string | null;
  transactionCurrencyCode: string | null;
  transactionAmount: string | null;
  counterpartyTaxId: string | null;
  volume: string | null;
  price: string | null;
}

export interface ParsedCsvLoad {
  fileHash: string;
  lines: ParsedCsvLine[];
}

const ALLOWED_MIME_TYPES = new Set([
  'text/csv',
  'text/plain',
  'application/csv',
  'application/vnd.ms-excel',
  'application/octet-stream',
]);

/** Valida tamaño, tipo/extensión y decodifica UTF-8 sin caracteres nulos. */
export function validateUploadedCsvFile(file: {
  originalname?: string;
  mimetype?: string;
  size?: number;
  buffer?: Buffer;
} | undefined): { fileName: string; buffer: Buffer } {
  if (!file || !Buffer.isBuffer(file.buffer)) {
    throw new BadRequestException('El archivo CSV (file) es obligatorio');
  }
  const size = file.size ?? file.buffer.length;
  if (size <= 0) {
    throw new BadRequestException('El archivo CSV está vacío');
  }
  if (size > MAX_CSV_BYTES || file.buffer.length > MAX_CSV_BYTES) {
    throw new BadRequestException(`El archivo CSV excede el tamaño máximo de ${MAX_CSV_BYTES} bytes`);
  }
  const rawName = (file.originalname ?? '').trim();
  const baseName = rawName.split(/[\\/]/).pop()?.trim() ?? '';
  if (!baseName || !/\.csv$/i.test(baseName)) {
    throw new BadRequestException('El archivo debe tener extensión .csv');
  }
  if (!/^[A-Za-z0-9_.-]{1,128}$/.test(baseName)) {
    throw new BadRequestException('El nombre del archivo contiene caracteres inválidos');
  }
  const mime = (file.mimetype ?? '').toLowerCase().split(';')[0].trim();
  if (mime && !ALLOWED_MIME_TYPES.has(mime)) {
    throw new BadRequestException(`Tipo de archivo no permitido (${mime}); se requiere text/csv`);
  }
  if (file.buffer.includes(0)) {
    throw new BadRequestException('El archivo no es un CSV de texto válido');
  }
  return { fileName: baseName, buffer: file.buffer };
}

/** Infiere PYG o BALANCE a partir del nombre del archivo o del campo financialStatementCode. */
export function resolveFinancialStatementCode(
  explicitCode: string | undefined,
  fileName: string,
): 'PYG' | 'BALANCE' {
  if (explicitCode !== undefined && explicitCode.trim() !== '') {
    const normalized = explicitCode.trim().toUpperCase();
    if (normalized !== 'PYG' && normalized !== 'BALANCE') {
      throw new BadRequestException('financialStatementCode debe ser PYG o BALANCE');
    }
    return normalized;
  }
  const lower = fileName.toLowerCase();
  if (lower.startsWith('balance')) return 'BALANCE';
  if (lower.startsWith('presupuesto') || lower.startsWith('pyg')) return 'PYG';
  return 'PYG';
}

/** Parsea una fila CSV respetando comillas dobles RFC 4180. */
export function splitCsvLine(line: string, rowNumber: number): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      if (current.length > 0) {
        throw new BadRequestException(`Fila ${rowNumber}: comillas mal cerradas en el CSV`);
      }
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }

  if (inQuotes) {
    throw new BadRequestException(`Fila ${rowNumber}: comillas sin cerrar en el CSV`);
  }
  fields.push(current.trim());
  return fields;
}

const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

function parseOptionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function parseOptionalDecimal(value: string, rowNumber: number, column: string): string | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (!DECIMAL_RE.test(trimmed)) {
    throw new BadRequestException(`Fila ${rowNumber}, columna ${column}: número decimal inválido "${trimmed}"`);
  }
  return trimmed;
}

/**
 * Parsea el buffer CSV, valida encabezados obligatorios del diccionario de datos y
 * devuelve el hash SHA-256 y las filas listas para insertar en "dataLoadLine".
 */
export function parseCsvBuffer(buffer: Buffer): ParsedCsvLoad {
  const fileHash = createHash('sha256').update(buffer).digest('hex');
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const rawLines = text.split(/\r?\n/);

  // Quitar líneas vacías al final del archivo
  while (rawLines.length > 0 && rawLines[rawLines.length - 1].trim() === '') {
    rawLines.pop();
  }

  if (rawLines.length === 0) {
    throw new BadRequestException('El archivo CSV no contiene encabezados');
  }

  const headerFields = splitCsvLine(rawLines[0], 1).map((h) => h.toLowerCase());
  const expected = [...EXPECTED_CSV_HEADERS];
  const missing = expected.filter((col) => !headerFields.includes(col));
  const extra = headerFields.filter((col) => !expected.includes(col as CsvColumnName));
  if (missing.length > 0 || extra.length > 0 || headerFields.length !== expected.length) {
    throw new BadRequestException(
      `Encabezados CSV inválidos. Se esperan: ${expected.join(', ')}` +
        (missing.length ? `. Faltan: ${missing.join(', ')}` : '') +
        (extra.length ? `. No reconocidos: ${extra.join(', ')}` : ''),
    );
  }

  const colIndex = new Map<CsvColumnName, number>();
  headerFields.forEach((col, idx) => colIndex.set(col as CsvColumnName, idx));

  if (rawLines.length < 2) {
    throw new BadRequestException('El archivo CSV no contiene filas de datos');
  }

  const lines: ParsedCsvLine[] = [];
  for (let i = 1; i < rawLines.length; i++) {
    const raw = rawLines[i];
    if (raw.trim() === '') continue;
    const rowNumber = i + 1; // fila 2..N como en Excel y generar_seed_sql.py
    const cols = splitCsvLine(raw, rowNumber);
    if (cols.length !== expected.length) {
      throw new BadRequestException(
        `Fila ${rowNumber}: se esperaban ${expected.length} columnas y llegaron ${cols.length}`,
      );
    }
    const get = (name: CsvColumnName): string => cols[colIndex.get(name)!] ?? '';

    const amount = parseOptionalDecimal(get('monto'), rowNumber, 'monto');
    if (amount === null) {
      throw new BadRequestException(`Fila ${rowNumber}, columna monto: valor obligatorio`);
    }

    lines.push({
      rowNumber,
      companyCode: parseOptionalText(get('empresa')),
      scenarioCode: parseOptionalText(get('escenario')),
      periodCode: parseOptionalText(get('periodo')),
      localAccountCode: parseOptionalText(get('cuenta_local')),
      description: parseOptionalText(get('descripcion')),
      currencyCode: parseOptionalText(get('moneda')),
      amount,
      icPartnerCode: parseOptionalText(get('socio_ic')),
      icDocumentId: parseOptionalText(get('doc_ic_id')),
      transactionCurrencyCode: parseOptionalText(get('moneda_tx')),
      transactionAmount: parseOptionalDecimal(get('monto_tx'), rowNumber, 'monto_tx'),
      counterpartyTaxId: parseOptionalText(get('contraparte_id_fiscal')),
      volume: parseOptionalDecimal(get('volumen'), rowNumber, 'volumen'),
      price: parseOptionalDecimal(get('precio'), rowNumber, 'precio'),
    });
  }

  if (lines.length === 0) {
    throw new BadRequestException('El archivo CSV no contiene filas de datos');
  }

  return { fileHash, lines };
}
