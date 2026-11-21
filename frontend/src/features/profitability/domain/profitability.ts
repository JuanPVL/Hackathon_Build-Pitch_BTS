import type { CompanyProfitability, ProfitabilityView } from './types'
import { formatAmount, formatCompact, formatPercent } from '@/shared/format/number'

export const DEFAULT_VIEW: ProfitabilityView = 'consolidado'

/** Valor del parámetro `vista` de la URL → vista válida (por defecto, con eliminación IC). */
export function parseView(raw: string | null): ProfitabilityView {
  return raw === 'sin-eliminar' ? 'sin-eliminar' : DEFAULT_VIEW
}

/** Formatea según unidad: proporción como porcentaje, USD como monto entero. */
export function formatByUnit(value: number, unit: 'USD' | 'RATIO'): string {
  return unit === 'RATIO' ? formatPercent(value) : formatAmount(value)
}

/** Comparativos: capitales en millones ("20.22 M"), proporciones en %, otros montos enteros. */
export function formatComparisonValue(value: number, unit: 'USD' | 'RATIO'): string {
  if (unit === 'RATIO') return formatPercent(value)
  return Math.abs(value) >= 1_000_000 ? formatCompact(value) : formatAmount(value)
}

export type ValueVerdict = 'crea' | 'destruye'

/** Una empresa crea valor solo si su EVA es estrictamente positivo. */
export function verdictOf(eva: number): ValueVerdict {
  return eva > 0 ? 'crea' : 'destruye'
}

/** Empresas de mayor a menor EVA, sin mutar la entrada. */
export function sortByEva(rows: CompanyProfitability[]): CompanyProfitability[] {
  return [...rows].sort((a, b) => b.eva - a.eva)
}

export function countValueCreators(rows: CompanyProfitability[]): { creating: number; total: number } {
  return { creating: rows.filter(r => verdictOf(r.eva) === 'crea').length, total: rows.length }
}

/** El EVA con signo explícito para que no dependa del color. */
export function signedEva(eva: number): string {
  const text = formatAmount(eva)
  return eva > 0 ? `+${text}` : text
}
