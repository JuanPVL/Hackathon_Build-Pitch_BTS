import type { HttpClient } from '@/shared/api/httpClient'
import type { ScenarioQuery } from '@/entities'
import type { ReconciliationReport, ReconciliationFilter } from '../domain/types'
import type { ReconciliationRepository } from '../ports/ReconciliationRepository'

/** Adaptador HTTP contra NestJS. Rutas = propuesta en docs/api-contract.md (pendiente de confirmar). */
export class HttpReconciliationRepository implements ReconciliationRepository {
  constructor(private readonly http: HttpClient) {}

  getReport(query: ScenarioQuery, filter: ReconciliationFilter, signal?: AbortSignal): Promise<ReconciliationReport> {
    return this.http.get<ReconciliationReport>(`/scenarios/${encodeURIComponent(query.scenarioId)}/ic/reconciliation`, { query: { type: filter.type, period: filter.period }, signal })
  }
}
