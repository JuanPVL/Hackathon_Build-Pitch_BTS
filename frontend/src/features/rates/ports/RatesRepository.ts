import type { ScenarioQuery } from '@/entities'
import type { RatesTable } from '../domain/types'

/** Puerto del módulo: la UI y los hooks dependen de esta interfaz, no del transporte. */
export interface RatesRepository {
  getTable(query: ScenarioQuery, signal?: AbortSignal): Promise<RatesTable>
}
