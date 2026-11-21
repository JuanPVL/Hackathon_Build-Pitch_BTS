import type { ScenarioQuery } from '@/entities'
import type { ConsolidationSummary } from '../domain/types'

/** Puerto del módulo: la UI y los hooks dependen de esta interfaz, no del transporte. */
export interface ConsolidationRepository {
  getSummary(query: ScenarioQuery, signal?: AbortSignal): Promise<ConsolidationSummary>
}
