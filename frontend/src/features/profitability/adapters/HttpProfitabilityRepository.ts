import type { HttpClient } from '@/shared/api/httpClient'
import type { ScenarioQuery } from '@/entities'
import type { ProfitabilityReport, ProfitabilityView } from '../domain/types'
import type { ProfitabilityRepository } from '../ports/ProfitabilityRepository'

/** Adaptador HTTP contra NestJS. Rutas = propuesta en docs/api-contract.md (pendiente de confirmar). */
export class HttpProfitabilityRepository implements ProfitabilityRepository {
  constructor(private readonly http: HttpClient) {}

  getReport(query: ScenarioQuery, view: ProfitabilityView, signal?: AbortSignal): Promise<ProfitabilityReport> {
    return this.http.get<ProfitabilityReport>(`/scenarios/${encodeURIComponent(query.scenarioId)}/profitability`, { query: { view }, signal })
  }
}
