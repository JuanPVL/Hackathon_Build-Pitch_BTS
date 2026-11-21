import type { CompanyCode } from '@/entities'

export type ProfitabilityView = 'consolidado' | 'sin-eliminar'

export interface KpiComponent { label: string; value: number; unit: 'USD' | 'RATIO'; lineageRef?: string }

export interface KpiBreakdown {
  code: 'ROIC' | 'ROCE' | 'EVA'
  value: number
  unit: 'USD' | 'RATIO'
  formula: string
  components: KpiComponent[]
  note: string
}

export interface CompanyProfitability { company: CompanyCode; name: string; roic: number; roce: number; eva: number }

export interface ComparisonRow { label: string; left: number; right: number; unit: 'USD' | 'RATIO' }

/** Respuesta de GET /scenarios/{scenarioId}/profitability?view= (propuesta). */
export interface ProfitabilityReport {
  view: ProfitabilityView
  wacc: number
  effectiveTaxRate: number
  kpis: KpiBreakdown[]
  byCompany: CompanyProfitability[]
  /** Mismo dato, otra decisión: sin eliminar vs con eliminación. */
  eliminationComparison: ComparisonRow[]
  /** Indicadores que se frenan: con errores sin validar vs validado. */
  unvalidatedComparison: ComparisonRow[]
}
