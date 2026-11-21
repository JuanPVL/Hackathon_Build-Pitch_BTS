import type { AccountLine, ConsolidationSummary, KpiValue, PipelineStepCode, PipelineStepStatus } from './types'
import { formatAmount, formatPercent, formatPoints, formatSigned } from '@/shared/format/number'

const STEP_TITLES: Record<PipelineStepCode, string> = {
  VALIDAR: '1. Validar',
  CONCILIAR: '2. Conciliar',
  CONVERTIR: '3. Convertir',
  ELIMINAR: '4. Eliminar',
  EXPLICAR: '5. Explicar',
}

/** Pasos del cierre en el orden del proceso, con su título numerado. */
export function toPipelineSteps(steps: PipelineStepStatus[]) {
  const order = Object.keys(STEP_TITLES) as PipelineStepCode[]
  return [...steps]
    .sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code))
    .map(s => ({ title: STEP_TITLES[s.code], caption: s.caption, closed: s.closed }))
}

/** Cuánto inflaría las ventas no eliminar el intercompany (proporción sobre el consolidado). */
export function uneliminatedSalesRatio(sales: ConsolidationSummary['sales']): number {
  if (sales.consolidated === 0) return 0
  return sales.aggregate / sales.consolidated - 1
}

/** Verifica la ecuación Agregado − Eliminaciones = Consolidado (tolerancia de redondeo). */
export function salesEquationHolds(sales: ConsolidationSummary['sales'], tolerance = 0.5): boolean {
  return Math.abs(sales.aggregate - sales.eliminations - sales.consolidated) < tolerance
}

/** Diferencia del KPI frente a la vista sin eliminar. */
export function kpiDifference(kpi: KpiValue): number {
  return kpi.value - kpi.withoutElimination
}

export function formatKpiValue(kpi: KpiValue): string {
  return kpi.unit === 'RATIO' ? formatPercent(kpi.value) : formatAmount(kpi.value)
}

export function formatKpiWithout(kpi: KpiValue): string {
  return kpi.unit === 'RATIO' ? formatPercent(kpi.withoutElimination) : formatAmount(kpi.withoutElimination)
}

/** Diferencia con signo: puntos porcentuales para proporciones, USD para montos. */
export function formatKpiDifference(kpi: KpiValue): string {
  const diff = kpiDifference(kpi)
  if (kpi.unit === 'RATIO') return Math.abs(diff) < 0.00005 ? '±0.00 pp' : formatPoints(diff)
  return formatSigned(diff)
}

/** Máximo valor absoluto, base común de las barras. */
export function maxAbs(values: number[]): number {
  return values.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
}

/** Empresas ordenadas de mayor a menor EVA, sin mutar la entrada. */
export function sortEvaDesc<T extends { eva: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.eva - a.eva)
}

/** Línea afectada por una eliminación (monto distinto de cero). */
export function hasElimination(line: AccountLine): boolean {
  return line.elimination !== 0
}

/** Texto del ajuste de eliminación de una línea; null si no hay. */
export function eliminationNote(line: AccountLine): string | null {
  if (!hasElimination(line)) return null
  return line.isIntercompany ? `eliminada ${formatAmount(line.elimination)}` : `ajuste ${formatSigned(line.elimination)}`
}
