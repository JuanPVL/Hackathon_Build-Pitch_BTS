import type { HttpClient } from '@/shared/api/httpClient'
import { Backend, numberOf } from '@/shared/api/backend'
import type { ScenarioQuery } from '@/entities'
import type { ReconciliationReport, ReconciliationFilter } from '../domain/types'
import type { ReconciliationRepository } from '../ports/ReconciliationRepository'
import { mapPair, pairCounts } from './mapping'

export class HttpReconciliationRepository implements ReconciliationRepository {
  private readonly backend: Backend
  constructor(http: HttpClient) { this.backend = new Backend(http) }

  async getReport(query: ScenarioQuery, filter: ReconciliationFilter, signal?: AbortSignal): Promise<ReconciliationReport> {
    const run = await this.backend.latestRun(query.scenarioId, signal)
    const data = await this.backend.reconciliation(run.runId, signal)
    const allPairs = data.reconciliation.map(row => mapPair(row))
    const pairs = allPairs.filter(pair =>
      (!filter.period || pair.key.includes(filter.period)) &&
      (!filter.type || pair.type === filter.type),
    )
    const counts = pairCounts(data.reconciliation)
    return {
      totals: counts,
      tolerance: { usd: numberOf(run.parameterSnapshot?.TOLERANCIA_FX_USD), pct: numberOf(run.parameterSnapshot?.TOLERANCIA_FX_PCT) },
      pairs,
      byResult: [...new Set(allPairs.map(pair => pair.result))].map(result => ({ result, count: allPairs.filter(pair => pair.result === result).length })),
      typeFilterAvailable: true,
    }
  }
}
