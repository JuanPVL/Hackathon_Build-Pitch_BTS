import type { HttpClient } from '@/shared/api/httpClient'
import type { ScenarioQuery } from '@/entities'
import type { EliminationReport } from '../domain/types'
import type { EliminationRepository } from '../ports/EliminationRepository'

/** Adaptador HTTP contra NestJS. Rutas = propuesta en docs/api-contract.md (pendiente de confirmar). */
export class HttpEliminationRepository implements EliminationRepository {
  constructor(private readonly http: HttpClient) {}

  getReport(query: ScenarioQuery, signal?: AbortSignal): Promise<EliminationReport> {
    return this.http.get<EliminationReport>(`/scenarios/${encodeURIComponent(query.scenarioId)}/eliminations`, { query: { currency: query.currency }, signal })
  }
}
