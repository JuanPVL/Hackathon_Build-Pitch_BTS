import { formatSigned } from '@/shared/format/number'
import type { RateAlert, RateRow, RatesTable } from './types'

/** Tasa a USD (USD por 1 unidad de moneda) a partir de unidades por 1 USD. 0 si la tasa no es válida. */
export function usdPerUnit(unitsPerUsd: number): number {
  return unitsPerUsd > 0 ? 1 / unitsPerUsd : 0
}

/**
 * Variación del presupuesto contra el escenario anterior, como proporción (0.0389 = +3.89 %).
 * null si no hay escenario anterior o la tasa no cambió.
 */
export function rateVariation(row: Pick<RateRow, 'budget' | 'budgetPrevious'>): number | null {
  if (row.budgetPrevious === null || row.budgetPrevious <= 0) return null
  const ratio = row.budget / row.budgetPrevious - 1
  return Math.abs(ratio) < 1e-9 ? null : ratio
}

/** `+3.9 %` / `−2.0 %`, con un decimal. */
export function formatVariation(ratio: number): string {
  return `${formatSigned(ratio * 100, 1)} %`
}

export function variationDirection(ratio: number): 'up' | 'down' {
  return ratio > 0 ? 'up' : 'down'
}

export type RateType = RatesTable['conversionRules'][number]['rateType']
export function rateTypeLabel(type: RateType): string {
  return { PRESUPUESTO: 'PRESUPUESTO', PROMEDIO: 'PROMEDIO', CIERRE: 'CIERRE', HISTORICA: 'HISTÓRICA' }[type]
}

export function alertTone(alert: RateAlert): 'err' | 'info' {
  return alert.severity === 'BLOQUEANTE' ? 'err' : 'info'
}

/** Bloqueantes primero; conserva el orden original dentro de cada grupo. */
export function sortAlerts(alerts: readonly RateAlert[]): RateAlert[] {
  const rank = (a: RateAlert) => (a.severity === 'BLOQUEANTE' ? 0 : 1)
  return alerts.map((a, i) => ({ a, i })).sort((x, y) => rank(x.a) - rank(y.a) || x.i - y.i).map(x => x.a)
}

export function statusLabel(status: RatesTable['status']): string {
  return status === 'VIGENTE' ? 'Vigente' : 'Borrador'
}

/** Descripción de una moneda: `Quetzal · GT1, GT2`. */
export function currencyDescription(row: Pick<RateRow, 'name' | 'companies'>): string {
  return row.companies.length > 0 ? `${row.name} · ${row.companies.join(', ')}` : row.name
}
