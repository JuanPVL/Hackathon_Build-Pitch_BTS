import type { ScenarioQuery } from '@/entities'
import type { ValidationReport } from '../domain/types'

/** Puerto del módulo: la UI y los hooks dependen de esta interfaz, no del transporte. */
export interface ValidationRepository {
  getReport(query: ScenarioQuery, signal?: AbortSignal): Promise<ValidationReport>
  acceptCorrection(findingId: string, justification: string, signal?: AbortSignal): Promise<void>
}
