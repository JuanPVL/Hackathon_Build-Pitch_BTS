import type { ScenarioQuery } from '@/entities'
import type { ReconciliationReport, ReconciliationFilter } from '../domain/types'

/** Puerto del módulo: la UI y los hooks dependen de esta interfaz, no del transporte. */
export interface ReconciliationRepository {
  getReport(query: ScenarioQuery, filter: ReconciliationFilter, signal?: AbortSignal): Promise<ReconciliationReport>
}
