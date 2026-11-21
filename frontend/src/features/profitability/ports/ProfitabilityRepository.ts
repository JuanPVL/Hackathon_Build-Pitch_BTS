import type { ScenarioQuery } from '@/entities'
import type { ProfitabilityReport, ProfitabilityView } from '../domain/types'

/** Puerto del módulo: la UI y los hooks dependen de esta interfaz, no del transporte. */
export interface ProfitabilityRepository {
  getReport(query: ScenarioQuery, view: ProfitabilityView, signal?: AbortSignal): Promise<ProfitabilityReport>
}
