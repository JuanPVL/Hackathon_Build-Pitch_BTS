import type { CurrencyCode, LoadStatus } from '@/entities'

/** B = bloqueante, A = advertencia (requiere justificación), I = informativa. */
export type Severity = 'B' | 'A' | 'I'

export interface Finding {
  id: string
  /** Código de regla del validador, p. ej. V08. */
  rule: string
  severity: Severity
  /** Empresa, par de empresas (`US2→MX2`) o moneda (`MXN`). */
  scope: string
  /** Ancla del linaje: `presupuesto_US1_V1.csv#fila46`. */
  record: string
  message: string
  found?: string
  expected?: string
  suggestion?: string
  impactUsd: number
}

export interface LoadSummary {
  /** Empresa (GT1…) o `TASAS` para la tabla de tasas del grupo. */
  owner: string
  currency: CurrencyCode | 'GRUPO'
  budget: LoadStatus | null
  balance: LoadStatus | null
  findings: number
}

/** Respuesta de GET /scenarios/{scenarioId}/validation (propuesta). */
export interface ValidationReport {
  publishable: boolean
  loads: LoadSummary[]
  totals: { blocking: number; warnings: number; info: number }
  /** Ordenados por impacto en USD descendente (regla del validador). */
  findings: Finding[]
}
