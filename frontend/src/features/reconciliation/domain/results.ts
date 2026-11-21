import { formatSigned } from '@/shared/format/number'
import { RESULT_ORDER } from '@/entities/ic'
import type { IcPair, ReconciliationResult } from './types'

// Etiquetas, tonos y acciones de cada resultado viven en entities/ic (concepto compartido).
export { resultInfo, agreedLabel, RESULT_ORDER } from '@/entities/ic'
export type { ResultInfo, ResultTone } from '@/entities/ic'

/** Conteo por resultado en orden fijo; los resultados sin documentos aparecen con 0. */
export function orderedResultCounts(byResult: { result: ReconciliationResult; count: number }[]): { result: ReconciliationResult; count: number }[] {
  return RESULT_ORDER.map(result => ({ result, count: byResult.find(r => r.result === result)?.count ?? 0 }))
}

/** "GT1 → MX1" */
export function routeLabel(pair: Pick<IcPair, 'issuer' | 'receiver'>): string {
  return `${pair.issuer ?? '—'} → ${pair.receiver ?? '—'}`
}

/** Diferencia USD con dos decimales y signo; el cero se muestra "0.00". */
export function differenceLabel(value: number): string {
  return Math.abs(value) < 0.005 ? '0.00' : formatSigned(value, 2)
}

/**
 * Tolerancia legible. `pct` puede venir como proporción (0.02) o como porcentaje (2);
 * a partir de 1 se asume porcentaje (pendiente de confirmar con el backend).
 */
export function toleranceLabel(tolerance: { usd: number; pct: number }): string {
  if (!Number.isFinite(tolerance.usd) || !Number.isFinite(tolerance.pct)) return 'No disponible en la corrida'
  const pct = tolerance.pct < 1 ? tolerance.pct * 100 : tolerance.pct
  const pctText = Number.isInteger(pct) ? String(pct) : pct.toFixed(2)
  return `USD ${tolerance.usd} o ${pctText} %`
}
