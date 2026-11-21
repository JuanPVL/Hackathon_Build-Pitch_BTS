/**
 * Formateo numérico del producto UNIVERA.
 * Separadores tipo en-US (coma de miles, punto decimal) y signo menos
 * tipográfico U+2212 en lugar del guion ASCII.
 * Funciones puras, sin dependencias externas.
 */

const MINUS = '−';

const formatters = new Map<number, Intl.NumberFormat>();

function getFormatter(decimals: number): Intl.NumberFormat {
  let formatter = formatters.get(decimals);
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    formatters.set(decimals, formatter);
  }
  return formatter;
}

/**
 * Formatea un número con separador de miles y `decimals` decimales.
 * Negativos usan U+2212. Cero, -0 y valores que redondean a cero devuelven "0".
 *
 * formatAmount(12957553) => "12,957,553"
 * formatAmount(-977540)  => "−977,540"
 */
export function formatAmount(value: number, decimals = 0): string {
  const raw = getFormatter(decimals).format(value);
  if (/^-?0(\.0+)?$/.test(raw)) return '0';
  return raw.replace('-', MINUS);
}

/**
 * Igual que formatAmount, pero siempre con signo. El cero no lleva signo.
 *
 * formatSigned(300000)        => "+300,000"
 * formatSigned(-78.4319, 2)   => "−78.43"
 */
export function formatSigned(value: number, decimals = 0): string {
  const text = formatAmount(value, decimals);
  if (text === '0' || text.startsWith(MINUS)) return text;
  return `+${text}`;
}

/**
 * Monto con código de moneda separado por un espacio.
 *
 * formatMoney(8333, 'USD')      => "USD 8,333"
 * formatMoney(-2039, 'USD')     => "USD −2,039"
 */
export function formatMoney(value: number, currency: string, decimals = 0): string {
  return `${currency} ${formatAmount(value, decimals)}`;
}

/**
 * Formato abreviado: millones con 2 decimales (" M"), miles con 0 decimales (" K"),
 * y el resto con formatAmount.
 *
 * formatCompact(12957553)   => "12.96 M"
 * formatCompact(142000)     => "142 K"
 * formatCompact(-41491120)  => "−41.49 M"
 */
export function formatCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${formatAmount(value / 1_000_000, 2)} M`;
  if (abs >= 1_000) return `${formatAmount(value / 1_000, 0)} K`;
  return formatAmount(value);
}

/**
 * Recibe una proporción (0.11951 = 11.95 %) y la formatea como porcentaje.
 *
 * formatPercent(0.11951)  => "11.95 %"
 * formatPercent(-1.919)   => "−191.90 %"
 */
export function formatPercent(ratio: number, decimals = 2): string {
  return `${formatAmount(ratio * 100, decimals)} %`;
}

/**
 * Recibe una diferencia expresada como proporción y la muestra en puntos
 * porcentuales con signo.
 *
 * formatPoints(0.0131)  => "+1.31 pp"
 */
export function formatPoints(diffRatio: number, decimals = 2): string {
  return `${formatSigned(diffRatio * 100, decimals)} pp`;
}

/**
 * Tasa o índice con `decimals` decimales. Agrupa miles solo si el valor lo requiere.
 *
 * formatRate(18.7)     => "18.70"
 * formatRate(1234.5)   => "1,234.50"
 */
export function formatRate(value: number, decimals = 2): string {
  return formatAmount(value, decimals);
}

/**
 * true si el valor es estrictamente menor que cero (-0 devuelve false).
 */
export function isNegative(value: number): boolean {
  return value < 0;
}
