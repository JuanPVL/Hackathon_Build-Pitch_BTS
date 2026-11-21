import type { CompanyCode, ScenarioQuery } from '@/entities'
import type { BalanceMatrix, MatrixView, PairDetail } from '../domain/types'

/** Puerto del módulo: la UI y los hooks dependen de esta interfaz, no del transporte. */
export interface CurrentAccountRepository {
  getMatrix(query: ScenarioQuery, view: MatrixView, signal?: AbortSignal): Promise<BalanceMatrix>
  getPair(query: ScenarioQuery, company: CompanyCode, counterparty: CompanyCode, signal?: AbortSignal): Promise<PairDetail>
}
