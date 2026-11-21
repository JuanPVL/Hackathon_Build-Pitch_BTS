import type { HttpClient } from '@/shared/api/httpClient'
import type { VarianceBridge, BridgeRequest } from '../domain/types'
import type { VarianceRepository } from '../ports/VarianceRepository'

/** Adaptador HTTP contra NestJS. Rutas = propuesta en docs/api-contract.md (pendiente de confirmar). */
export class HttpVarianceRepository implements VarianceRepository {
  constructor(private readonly http: HttpClient) {}

  getBridge(request: BridgeRequest, signal?: AbortSignal): Promise<VarianceBridge> {
    return this.http.get<VarianceBridge>('/variance-bridge', { query: { from: request.from, to: request.to, metric: request.metric }, signal })
  }
}
