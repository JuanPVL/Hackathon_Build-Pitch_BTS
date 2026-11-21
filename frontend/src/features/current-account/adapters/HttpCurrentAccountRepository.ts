import type { HttpClient } from '@/shared/api/httpClient'
import { Backend, numberOf } from '@/shared/api/backend'
import type { ReconciliationDto } from '@/shared/api/backend'
import type { CompanyCode, ScenarioQuery } from '@/entities'
import type { BalanceMatrix, MatrixCell, MatrixView, PairDetail } from '../domain/types'
import type { CurrentAccountRepository } from '../ports/CurrentAccountRepository'
import { pairCounts, reconciliationResult } from '@/features/reconciliation/adapters/mapping'
import { inferAgreedFromKey } from '@/features/ic-document/adapters/HttpIcDocumentRepository'

function cellStatus(rows: ReconciliationDto[], value: number): MatrixCell['status'] {
  if (!rows.length) return value === 0 ? 'SIN_SALDO' : 'DIFERENCIA'
  if (rows.some(r => !['CONCILIADO', 'CONCILIADO_FX'].includes(r.statusCode))) return 'DIFERENCIA'
  return rows.some(r => r.statusCode === 'CONCILIADO_FX') ? 'FX' : 'EXACTO'
}
function between(row: ReconciliationDto, company: CompanyCode, counterparty: CompanyCode) {
  return (row.issuerCompanyId === company && row.receiverCompanyId === counterparty)
    || (row.issuerCompanyId === counterparty && row.receiverCompanyId === company)
}
export class HttpCurrentAccountRepository implements CurrentAccountRepository {
  private readonly backend: Backend
  private readonly bundleCache = new Map<string, Promise<{
    matrix: Awaited<ReturnType<Backend['matrix']>>
    reconciliation: Awaited<ReturnType<Backend['reconciliation']>>
    companies: Awaited<ReturnType<Backend['companies']>>
  }>>()

  constructor(http: HttpClient) { this.backend = new Backend(http) }

  private fetchBundle(scenarioId: string, signal?: AbortSignal) {
    const cached = this.bundleCache.get(scenarioId)
    if (cached) return cached
    const promise = (async () => {
      const run = await this.backend.latestRun(scenarioId, signal)
      const [matrix, reconciliation, companies] = await Promise.all([
        this.backend.matrix(run.runId, signal),
        this.backend.reconciliation(run.runId, signal),
        this.backend.companies(signal),
      ])
      return { matrix, reconciliation, companies }
    })()
    promise.catch(() => this.bundleCache.delete(scenarioId))
    this.bundleCache.set(scenarioId, promise)
    return promise
  }

  async getMatrix(query: ScenarioQuery, view: MatrixView, signal?: AbortSignal): Promise<BalanceMatrix> {
    const { matrix, reconciliation, companies } = await this.fetchBundle(query.scenarioId, signal)
    const allRec = reconciliation.reconciliation
    const pygRows = allRec.filter(r => r.financialStatementCode === 'PYG')
    const balRows = allRec.filter(r => r.financialStatementCode === 'BALANCE')
    const hasSplitStatements = pygRows.length > 0 && balRows.length > 0

    let source: { company: CompanyCode; counterparty: CompanyCode; balanceUsd: number }[]
    if (view === 'saldo') {
      source = matrix.balances.map(row => ({
        company: row.companyId,
        counterparty: row.partnerCompanyId,
        balanceUsd: numberOf(row.balanceUsd),
      }))
    } else if (view === 'recibido' && hasSplitStatements) {
      // Agrupa el monto realmente registrado por la empresa receptora (compradora) en P&L (signo negativo = compra/gasto IC recibido).
      const byPair = new Map<string, { company: CompanyCode; counterparty: CompanyCode; balanceUsd: number }>()
      for (const row of pygRows) {
        if (!row.receiverCompanyId || !row.issuerCompanyId) continue
        const key = `${row.receiverCompanyId}|${row.issuerCompanyId}`
        const current = byPair.get(key) ?? {
          company: row.receiverCompanyId,
          counterparty: row.issuerCompanyId,
          balanceUsd: 0,
        }
        current.balanceUsd -= Math.abs(numberOf(row.receiverUsd))
        byPair.set(key, current)
      }
      source = [...byPair.values()].map(c => ({ ...c, balanceUsd: Math.round(c.balanceUsd * 100) / 100 }))
    } else {
      source = matrix.billed.map(row => ({
        company: view === 'recibido' ? row.receiverCompanyId : row.issuerCompanyId,
        counterparty: view === 'recibido' ? row.issuerCompanyId : row.receiverCompanyId,
        balanceUsd: numberOf(row.billedUsd),
      }))
    }

    const relevantRec = hasSplitStatements
      ? (view === 'saldo' ? balRows : pygRows)
      : allRec

    return {
      view,
      companies: companies.map(company => company.companyId),
      cells: source.map(cell => ({
        ...cell,
        status: cellStatus(relevantRec.filter(row => between(row, cell.company, cell.counterparty)), cell.balanceUsd),
      })),
      totals: pairCounts(relevantRec),
      receivedIsBilledTranspose: view === 'recibido',
    }
  }

  async getPair(query: ScenarioQuery, company: CompanyCode, counterparty: CompanyCode, signal?: AbortSignal): Promise<PairDetail> {
    const { matrix, reconciliation } = await this.fetchBundle(query.scenarioId, signal)
    const rows = reconciliation.reconciliation.filter(row => between(row, company, counterparty))
    const balanceUsd = numberOf(matrix.balances.find(row => row.companyId === company && row.partnerCompanyId === counterparty)?.balanceUsd ?? 0)
    const mirrorBalanceUsd = numberOf(matrix.balances.find(row => row.companyId === counterparty && row.partnerCompanyId === company)?.balanceUsd ?? 0)
    return {
      company, counterparty, balanceUsd, mirrorBalanceUsd,
      description: 'Saldos reportados por las empresas y conciliación de la corrida seleccionada.',
      fxDifferenceUsd: rows.filter(row => row.financialStatementCode === 'BALANCE' && row.statusCode === 'CONCILIADO_FX').reduce((sum, row) => sum + numberOf(row.differenceUsd), 0),
      documents: rows.map(row => {
        const reportedUsd = numberOf(row.issuerUsd)
        return {
          key: row.icDocumentId,
          statement: row.financialStatementCode,
          agreed: inferAgreedFromKey(row.icDocumentId, row.issuerCompanyId, reportedUsd),
          reportedUsd,
          result: reconciliationResult(row.statusCode),
        }
      }),
    }
  }
}
