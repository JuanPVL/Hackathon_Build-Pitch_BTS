import type { ScenarioQuery } from '@/entities'
import type { EliminationReport } from '../domain/types'

/** Puerto del módulo: la UI y los hooks dependen de esta interfaz, no del transporte. */
export interface EliminationRepository {
  getReport(query: ScenarioQuery, signal?: AbortSignal): Promise<EliminationReport>
}
