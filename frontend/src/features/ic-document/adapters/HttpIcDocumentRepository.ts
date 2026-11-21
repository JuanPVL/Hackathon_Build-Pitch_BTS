import type { HttpClient } from '@/shared/api/httpClient'
import type { IcDocumentKey } from '@/entities'
import type { IcDocumentDetail } from '../domain/types'
import type { IcDocumentRepository } from '../ports/IcDocumentRepository'

/** Adaptador HTTP contra NestJS. Rutas = propuesta en docs/api-contract.md (pendiente de confirmar). */
export class HttpIcDocumentRepository implements IcDocumentRepository {
  constructor(private readonly http: HttpClient) {}

  getDocument(key: IcDocumentKey, scenarioId: string, signal?: AbortSignal): Promise<IcDocumentDetail> {
    return this.http.get<IcDocumentDetail>(`/ic/documents/${encodeURIComponent(key)}`, { query: { scenario: scenarioId }, signal })
  }
}
