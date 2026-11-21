import type { IcDocumentKey } from '@/entities'
import type { IcDocumentDetail } from '../domain/types'

/** Puerto del módulo: la UI y los hooks dependen de esta interfaz, no del transporte. */
export interface IcDocumentRepository {
  getDocument(key: IcDocumentKey, scenarioId: string, signal?: AbortSignal): Promise<IcDocumentDetail>
}
