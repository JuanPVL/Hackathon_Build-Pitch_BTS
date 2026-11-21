import type { HttpClient } from '@/shared/api/httpClient'
import { Backend, groupKpi, numberOf } from '@/shared/api/backend'
import type { ScenarioQuery } from '@/entities'
import type { EliminationReport } from '../domain/types'
import type { EliminationRepository } from '../ports/EliminationRepository'

export class HttpEliminationRepository implements EliminationRepository {
  private readonly api: Backend
  constructor(http: HttpClient) { this.api = new Backend(http) }

  async getReport(query: ScenarioQuery, signal?: AbortSignal): Promise<EliminationReport> {
    const run = await this.api.latestRun(query.scenarioId, signal)
    const [ledger, balances, kpis, reconciliation] = await Promise.all([
      this.api.eliminations(run.runId, signal), this.api.consolidated(run.runId, signal),
      this.api.kpis(run.runId, signal), this.api.reconciliation(run.runId, signal),
    ])
    const before = groupKpi(kpis, 'AGREGADO')
    const after = groupKpi(kpis)
    const accounts = new Map(balances.accounts.map(account => [account.groupAccountId, account]))
    const amount = (accountType: string) => ledger.eliminations
      .filter(row => accounts.get(row.groupAccountId)?.accountTypeCode === accountType)
      .reduce((sum, row) => sum + Math.max(0, -numberOf(row.effectUsd)), 0)
    const pending = reconciliation.reconciliation.filter(row => !['CONCILIADO', 'CONCILIADO_FX'].includes(row.statusCode))
    const sumFx = (account: string) => ledger.eliminations.filter(row => row.groupAccountId === account)
      .reduce((sum, row) => sum + numberOf(row.effectUsd), 0)
    const capitalBefore = numberOf(before.capitalEmployedUsd)
    const capitalAfter = numberOf(after.capitalEmployedUsd)
    return {
      runId: run.runId,
      entries: [], // The backend exposes ledger effects, not invented issuer/receiver legs.
      ledger: ledger.eliminations.map(row => ({
        id: String(row.eliminationLineId), code: row.eliminationCode, rule: row.eliminationRuleCode,
        document: row.icDocumentId, company: row.companyId, account: row.groupAccountId,
        accountName: accounts.get(row.groupAccountId)?.name ?? row.groupAccountId,
        effectUsd: numberOf(row.effectUsd), source: row.sourceRef,
      })),
      summary: {
        pnl: amount('ING') + amount('GAS'),
        balance: amount('ACT') + amount('PAS') + amount('PAT'),
        pending: pending.length,
        ebitEffect: numberOf(after.ebitUsd) - numberOf(before.ebitUsd),
        icIncome: amount('ING'), icExpense: amount('GAS'),
        pairs: reconciliation.reconciliation.length - pending.length,
      },
      fxIsolated: { pnl: sumFx('7900'), cta: sumFx('3900') },
      capital: {
        employedBefore: capitalBefore, employedAfter: capitalAfter, icRemoved: capitalBefore - capitalAfter,
        roceBefore: numberOf(before.roce), roceAfter: numberOf(after.roce),
      },
    }
  }
}
