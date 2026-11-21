import type { HttpClient } from '@/shared/api/httpClient'
import { Backend, groupKpi, numberOf } from '@/shared/api/backend'
import type { ScenarioQuery } from '@/entities'
import type { AccountLine, ConsolidationSummary, KpiValue } from '../domain/types'
import type { ConsolidationRepository } from '../ports/ConsolidationRepository'

/** Compone los recursos reales de una misma corrida; nunca mezcla escenarios. */
export class HttpConsolidationRepository implements ConsolidationRepository {
  private readonly backend: Backend
  constructor(http: HttpClient) { this.backend = new Backend(http) }

  async getSummary(query: ScenarioQuery, signal?: AbortSignal): Promise<ConsolidationSummary> {
    const run = await this.backend.latestRun(query.scenarioId, signal)
    const [consolidated, kpis, reconciliation, companies] = await Promise.all([
      this.backend.consolidated(run.runId, signal),
      this.backend.kpis(run.runId, signal),
      this.backend.reconciliation(run.runId, signal),
      this.backend.companies(signal),
    ])
    const group = groupKpi(kpis)
    const aggregate = groupKpi(kpis, 'AGREGADO')
    const names = new Map(companies.map(company => [company.companyId, company.name]))
    const lines = consolidated.accounts.map((row): AccountLine => ({
      account: row.groupAccountId,
      name: row.name,
      aggregate: numberOf(row.aggregatedUsd),
      elimination: numberOf(row.eliminationsUsd),
      consolidated: numberOf(row.consolidatedUsd),
      // El endpoint no expone el catálogo isIntercompany; no se infiere por el monto.
    }))
    const incomeIds = new Set(consolidated.accounts.filter(row => ['ING', 'GAS'].includes(row.accountTypeCode)).map(row => row.groupAccountId))
    const specs = [
      ['EBIT', 'ebitUsd', 'USD', 'Ventas − costos − gastos operativos'],
      ['ROIC', 'roic', 'RATIO', 'NOPAT / capital invertido'],
      ['ROCE', 'roce', 'RATIO', 'EBIT / capital empleado'],
      ['EVA', 'evaUsd', 'USD', 'NOPAT − WACC × capital invertido'],
    ] as const
    const values: KpiValue[] = specs.map(([code, field, unit, formula]) => ({
      code, unit, formula, value: numberOf(group[field]), withoutElimination: numberOf(aggregate[field]),
    }))
    return {
      runId: run.runId,
      generatedAt: run.executedAt,
      lineageOk: run.lineageOk === true,
      // La API expone el flag de la corrida, no un conteo por cuenta.
      lineage: { accountsOk: Number.NaN, accountsTotal: Number.NaN },
      steps: [],
      sales: {
        aggregate: numberOf(aggregate.salesUsd),
        eliminations: numberOf(aggregate.salesUsd) - numberOf(group.salesUsd),
        consolidated: numberOf(group.salesUsd),
        icDocuments: new Set(reconciliation.reconciliation.map(row => row.icDocumentId)).size,
      },
      fxDifferenceIc: consolidated.accounts.filter(row => row.groupAccountId === '7900').reduce((sum, row) => sum + numberOf(row.consolidatedUsd), 0),
      kpis: values,
      incomeStatement: lines.filter(row => incomeIds.has(row.account)),
      balanceSheet: lines.filter(row => !incomeIds.has(row.account)),
      evaByCompany: kpis.companies.flatMap(row => row.companyId ? [{
        company: row.companyId,
        name: names.get(row.companyId) ?? row.companyId,
        eva: numberOf(row.evaUsd),
      }] : []),
    }
  }
}
