import type { HttpClient } from '@/shared/api/httpClient'
import { ApiError } from '@/shared/api/httpClient'
import type { IcDocumentKey } from '@/entities'
import type { IcDocumentDetail } from '../domain/types'
import type { IcDocumentRepository } from '../ports/IcDocumentRepository'

export class HttpIcDocumentRepository implements IcDocumentRepository {
  constructor(_http: HttpClient) {}
  async getDocument(_key: IcDocumentKey, _scenarioId: string, _signal?: AbortSignal): Promise<IcDocumentDetail> {
    throw new ApiError(501, 'El detalle completo del documento no está publicado en la API.')
  }
}
