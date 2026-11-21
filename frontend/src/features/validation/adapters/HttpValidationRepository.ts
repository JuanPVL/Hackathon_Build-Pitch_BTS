import type { HttpClient } from '@/shared/api/httpClient'
import type { ScenarioQuery } from '@/entities'
import type { ValidationReport } from '../domain/types'
import type { ValidationRepository } from '../ports/ValidationRepository'

/** Adaptador HTTP contra NestJS. Rutas = propuesta en docs/api-contract.md (pendiente de confirmar). */
export class HttpValidationRepository implements ValidationRepository {
  constructor(private readonly http: HttpClient) {}

  getReport(query: ScenarioQuery, signal?: AbortSignal): Promise<ValidationReport> {
    return this.http.get<ValidationReport>(`/scenarios/${encodeURIComponent(query.scenarioId)}/validation`, { signal })
  }

  acceptCorrection(findingId: string, justification: string, signal?: AbortSignal): Promise<void> {
    return this.http.post<void>(`/validation/findings/${encodeURIComponent(findingId)}/accept-correction`, { justification }, { signal })
  }
}
