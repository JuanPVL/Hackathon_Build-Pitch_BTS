import type { CompanyCode } from '@/entities'

export type PipelineStepCode = 'VALIDAR' | 'CONCILIAR' | 'CONVERTIR' | 'ELIMINAR' | 'EXPLICAR'
export interface PipelineStepStatus { code: PipelineStepCode; closed: boolean; caption: string }

export type KpiCode = 'EBIT' | 'ROIC' | 'ROCE' | 'EVA'
export interface KpiValue {
  code: KpiCode
  /** USD para EBIT/EVA; proporción (0.1195) para ROIC/ROCE. */
  value: number
  unit: 'USD' | 'RATIO'
  /** Mismo KPI sin eliminar intercompany, para comparar. */
  withoutElimination: number
  formula: string
}

export interface AccountLine {
  account: string
  name: string
  aggregate: number
  elimination: number
  consolidated: number
  isIntercompany: boolean
}

/** Respuesta de GET /scenarios/{scenarioId}/consolidation (propuesta). */
export interface ConsolidationSummary {
  runId: string
  generatedAt: string
  lineageOk: boolean
  lineage: { accountsOk: number; accountsTotal: number }
  steps: PipelineStepStatus[]
  sales: { aggregate: number; eliminations: number; consolidated: number; icDocuments: number }
  fxDifferenceIc: number
  kpis: KpiValue[]
  incomeStatement: AccountLine[]
  balanceSheet: AccountLine[]
  evaByCompany: { company: CompanyCode; name: string; eva: number }[]
}
