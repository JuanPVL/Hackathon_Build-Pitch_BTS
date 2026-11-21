import type { HttpClient } from '@/shared/api/httpClient'
import type { ScenarioQuery } from '@/entities'
import type { ConsolidationSummary } from '../domain/types'
import type { ConsolidationRepository } from '../ports/ConsolidationRepository'

/** Adaptador HTTP contra NestJS. Rutas = propuesta en docs/api-contract.md (pendiente de confirmar). */
export class HttpConsolidationRepository implements ConsolidationRepository {
  constructor(private readonly http: HttpClient) {}

  getSummary(query: ScenarioQuery, signal?: AbortSignal): Promise<ConsolidationSummary> {
    return this.http.get<ConsolidationSummary>(`/scenarios/${encodeURIComponent(query.scenarioId)}/consolidation`, { query: { currency: query.currency }, signal })
  }
}
