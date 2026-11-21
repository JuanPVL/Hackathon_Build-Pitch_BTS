import type { HttpClient } from '@/shared/api/httpClient'
import type { CompanyCode, ScenarioQuery } from '@/entities'
import type { BalanceMatrix, MatrixView, PairDetail } from '../domain/types'
import type { CurrentAccountRepository } from '../ports/CurrentAccountRepository'

/** Adaptador HTTP contra NestJS. Rutas = propuesta en docs/api-contract.md (pendiente de confirmar). */
export class HttpCurrentAccountRepository implements CurrentAccountRepository {
  constructor(private readonly http: HttpClient) {}

  getMatrix(query: ScenarioQuery, view: MatrixView, signal?: AbortSignal): Promise<BalanceMatrix> {
    return this.http.get<BalanceMatrix>(`/scenarios/${encodeURIComponent(query.scenarioId)}/ic/balances`, { query: { view, currency: query.currency }, signal })
  }

  getPair(query: ScenarioQuery, company: CompanyCode, counterparty: CompanyCode, signal?: AbortSignal): Promise<PairDetail> {
    return this.http.get<PairDetail>(`/scenarios/${encodeURIComponent(query.scenarioId)}/ic/balances/${company}/${counterparty}`, { signal })
  }
}
