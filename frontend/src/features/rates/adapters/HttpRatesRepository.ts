import type { HttpClient } from '@/shared/api/httpClient'
import type { ScenarioQuery } from '@/entities'
import type { RatesTable } from '../domain/types'
import type { RatesRepository } from '../ports/RatesRepository'

/** Adaptador HTTP contra NestJS. Rutas = propuesta en docs/api-contract.md (pendiente de confirmar). */
export class HttpRatesRepository implements RatesRepository {
  constructor(private readonly http: HttpClient) {}

  getTable(query: ScenarioQuery, signal?: AbortSignal): Promise<RatesTable> {
    return this.http.get<RatesTable>(`/scenarios/${encodeURIComponent(query.scenarioId)}/rates`, { signal })
  }
}
