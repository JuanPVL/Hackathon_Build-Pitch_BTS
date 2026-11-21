/** E1 ventas/servicios · E2 saldos · E3 préstamos · E4 intereses · E7 diferencia FX. */
export type EliminationRule = 'E1' | 'E2' | 'E3' | 'E4' | 'E5' | 'E6' | 'E7'

export interface EliminationEntry {
  rule: EliminationRule
  concept: string
  /** `4200 ↔ 5200` */
  accounts: string
  issuerAmount: number
  receiverAmount: number
  difference: number
  /** Cuenta que recibe la diferencia (7900 resultados, 3900 CTA). */
  targetAccount: string
}

/** Respuesta de GET /scenarios/{scenarioId}/eliminations (propuesta). Montos en USD. */
export interface LedgerEntry {
  id: string; code: string; rule: string; document: string | null; company: string | null
  account: string; accountName: string; effectUsd: number; source: string | null
}

export interface EliminationReport {
  /** Asientos originales del backend: efecto firmado por cuenta, sin patas ficticias. */
  ledger?: LedgerEntry[]
  runId: string
  summary: { pnl: number; balance: number; pending: number; ebitEffect: number; icIncome: number; icExpense: number; pairs: number }
  entries: EliminationEntry[]
  fxIsolated: { pnl: number; cta: number }
  capital: { employedBefore: number; icRemoved: number; employedAfter: number; roceBefore: number; roceAfter: number }
}
