import type { CompanyCode, IcDocumentKey, Money } from '@/entities'

import type { IcType, ReconciliationResult } from '@/entities/ic'
export type { IcType, ReconciliationResult }

export interface IcPair {
  key: IcDocumentKey
  type: IcType
  issuer: CompanyCode
  receiver: CompanyCode
  /** Monto pactado en la moneda de la factura. */
  agreed: Money
  issuerUsd: number
  receiverUsd: number
  differenceUsd: number
  result: ReconciliationResult
}

/** Respuesta de GET /scenarios/{scenarioId}/ic/reconciliation (propuesta). */
export interface ReconciliationReport {
  totals: { documents: number; reconciled: number; exact: number; fx: number; pending: number }
  tolerance: { usd: number; pct: number }
  pairs: IcPair[]
  /** Conteo por tipo de resultado ("cada diferencia tiene nombre"). */
  byResult: { result: ReconciliationResult; count: number }[]
}

export interface ReconciliationFilter { type?: IcType; period?: string }
