import type { CompanyCode, CurrencyCode } from '@/entities'

/** Una moneda de la tabla del grupo. Tasas en unidades por 1 USD (lo que lee una persona). */
export interface RateRow {
  currency: CurrencyCode
  name: string
  companies: CompanyCode[]
  /** Escenario anterior (para comparar); null si no aplica. */
  budgetPrevious: number | null
  budget: number
  closing: number
  historical: number
  /** Tasa del sistema (USD por 1 unidad), la que guarda cada cifra convertida. */
  budgetToUsd: number
}

export interface RateAlert { severity: 'BLOQUEANTE' | 'INFO'; title: string; detail: string; rule?: string }

/** Respuesta de GET /scenarios/{scenarioId}/rates (propuesta). */
export interface RatesTable {
  version: string
  status: 'VIGENTE' | 'BORRADOR'
  appliedTo: number
  rows: RateRow[]
  conversionRules: { scope: string; rateType: 'PRESUPUESTO' | 'PROMEDIO' | 'CIERRE' | 'HISTORICA' }[]
  ctaUsd: number
  controlBandPct: number
  alerts: RateAlert[]
}
