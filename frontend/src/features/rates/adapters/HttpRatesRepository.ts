import type { HttpClient } from '@/shared/api/httpClient'
import { ApiError } from '@/shared/api/httpClient'
import type { ScenarioQuery } from '@/entities'
import type { RatesTable } from '../domain/types'
import type { RatesRepository } from '../ports/RatesRepository'

export class HttpRatesRepository implements RatesRepository {
  constructor(_http: HttpClient) {}
  async getTable(_query: ScenarioQuery, _signal?: AbortSignal): Promise<RatesTable> {
    throw new ApiError(501, 'La consulta de tasas del grupo aún no está publicada por el backend. La consolidación usa las tasas de su corrida.')
  }
}
