import type { HttpClient } from '@/shared/api/httpClient'
import { Backend, numberOf } from '@/shared/api/backend'
import type { ScenarioQuery } from '@/entities'
import type { ReconciliationReport, ReconciliationFilter } from '../domain/types'
import type { ReconciliationRepository } from '../ports/ReconciliationRepository'
import { mapPair, pairCounts } from './mapping'

export class HttpReconciliationRepository implements ReconciliationRepository {
  private readonly backend: Backend
  private readonly bundleCache = new Map<string, Promise<{
    run: Awaited<ReturnType<Backend['latestRun']>>
    data: Awaited<ReturnType<Backend['reconciliation']>>
  }>>()

  constructor(http: HttpClient) { this.backend = new Backend(http) }

  private fetchBundle(scenarioId: string, signal?: AbortSignal) {
    const cached = this.bundleCache.get(scenarioId)
    if (cached) return cached
    const promise = (async () => {
      const run = await this.backend.latestRun(scenarioId, signal)
      const data = await this.backend.reconciliation(run.runId, signal)
      return { run, data }
    })()
    promise.catch(() => this.bundleCache.delete(scenarioId))
    this.bundleCache.set(scenarioId, promise)
    return promise
  }

  async getReport(query: ScenarioQuery, filter: ReconciliationFilter, signal?: AbortSignal): Promise<ReconciliationReport> {
    const { run, data } = await this.fetchBundle(query.scenarioId, signal)
    const allPairs = data.reconciliation.map(row => mapPair(row))
    const pairs = allPairs.filter(pair =>
      (!filter.period || pair.key.includes(filter.period)) &&
      (!filter.type || pair.type === filter.type),
    )
    const filteredRows = data.reconciliation.filter((_, idx) =>
      (!filter.period || allPairs[idx].key.includes(filter.period)) &&
      (!filter.type || allPairs[idx].type === filter.type),
    )
    const counts = pairCounts(filteredRows)
    const snap = run.parameterSnapshot ?? {}
    const tolUsd = numberOf(snap.TOLERANCIA_FX_USD ?? snap.TOLERANCIA_USD ?? 50)
    const tolPct = numberOf(snap.TOLERANCIA_FX_PCT ?? snap.TOLERANCIA_PCT ?? 0.02)
    return {
      totals: counts,
      tolerance: { usd: Number.isFinite(tolUsd) ? tolUsd : 50, pct: Number.isFinite(tolPct) ? tolPct : 0.02 },
      pairs,
      byResult: [...new Set(pairs.map(pair => pair.result))].map(result => ({ result, count: pairs.filter(pair => pair.result === result).length })),
      typeFilterAvailable: true,
    }
  }
}
