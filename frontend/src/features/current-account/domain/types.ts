import type { CompanyCode, IcDocumentKey, Money } from '@/entities'
import type { ReconciliationResult } from '@/features/reconciliation/domain/types'

export type MatrixView = 'saldo' | 'facturado' | 'recibido'

export interface MatrixCell {
  company: CompanyCode
  counterparty: CompanyCode
  /** + me deben · − les debo (USD). */
  balanceUsd: number
  status: 'EXACTO' | 'FX' | 'DIFERENCIA' | 'SIN_SALDO'
}

/** Respuesta de GET /scenarios/{scenarioId}/ic/balances?view= (propuesta). Fila = quien reporta. */
export interface BalanceMatrix {
  view: MatrixView
  companies: CompanyCode[]
  cells: MatrixCell[]
  totals: { documents: number; exact: number; fx: number; orphan: number; disputed: number }
}

export interface PairDocument { key: IcDocumentKey; agreed: Money; result: ReconciliationResult }

/** Respuesta de GET /scenarios/{scenarioId}/ic/balances/{company}/{counterparty} (propuesta). */
export interface PairDetail {
  company: CompanyCode
  counterparty: CompanyCode
  description: string
  balanceUsd: number
  mirrorBalanceUsd: number
  fxDifferenceUsd: number
  documents: PairDocument[]
}
