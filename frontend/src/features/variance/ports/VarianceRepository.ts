import type { VarianceBridge, BridgeRequest } from '../domain/types'

/** Puerto del módulo: la UI y los hooks dependen de esta interfaz, no del transporte. */
export interface VarianceRepository {
  getBridge(request: BridgeRequest, signal?: AbortSignal): Promise<VarianceBridge>
}
