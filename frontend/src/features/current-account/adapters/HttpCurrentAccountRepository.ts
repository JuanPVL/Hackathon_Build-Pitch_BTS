import type { HttpClient } from '@/shared/api/httpClient'
import { Backend, numberOf } from '@/shared/api/backend'
import type { ReconciliationDto } from '@/shared/api/backend'
import type { CompanyCode, ScenarioQuery } from '@/entities'
import type { BalanceMatrix, MatrixCell, MatrixView, PairDetail } from '../domain/types'
import type { CurrentAccountRepository } from '../ports/CurrentAccountRepository'
import { pairCounts, reconciliationResult } from '@/features/reconciliation/adapters/mapping'

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
  constructor(http: HttpClient) { this.backend = new Backend(http) }

  async getMatrix(query: ScenarioQuery, view: MatrixView, signal?: AbortSignal): Promise<BalanceMatrix> {
    const run = await this.backend.latestRun(query.scenarioId, signal)
    const [matrix, reconciliation, companies] = await Promise.all([
      this.backend.matrix(run.runId, signal), this.backend.reconciliation(run.runId, signal), this.backend.companies(signal),
    ])
    const source = view === 'saldo'
      ? matrix.balances.map(row => ({ company: row.companyId, counterparty: row.partnerCompanyId, balanceUsd: numberOf(row.balanceUsd) }))
      : matrix.billed.map(row => ({
        company: view === 'recibido' ? row.receiverCompanyId : row.issuerCompanyId,
        counterparty: view === 'recibido' ? row.issuerCompanyId : row.receiverCompanyId,
        balanceUsd: numberOf(row.billedUsd),
      }))
    return {
      view, companies: companies.map(company => company.companyId),
      cells: source.map(cell => ({ ...cell, status: cellStatus(reconciliation.reconciliation.filter(row => between(row, cell.company, cell.counterparty)), cell.balanceUsd) })),
      totals: pairCounts(reconciliation.reconciliation),
      receivedIsBilledTranspose: view === 'recibido',
    }
  }

  async getPair(query: ScenarioQuery, company: CompanyCode, counterparty: CompanyCode, signal?: AbortSignal): Promise<PairDetail> {
    const run = await this.backend.latestRun(query.scenarioId, signal)
    const [matrix, reconciliation] = await Promise.all([this.backend.matrix(run.runId, signal), this.backend.reconciliation(run.runId, signal)])
    const rows = reconciliation.reconciliation.filter(row => between(row, company, counterparty))
    const balanceUsd = numberOf(matrix.balances.find(row => row.companyId === company && row.partnerCompanyId === counterparty)?.balanceUsd ?? 0)
    const mirrorBalanceUsd = numberOf(matrix.balances.find(row => row.companyId === counterparty && row.partnerCompanyId === company)?.balanceUsd ?? 0)
    return {
      company, counterparty, balanceUsd, mirrorBalanceUsd,
      description: 'Saldos reportados por las empresas y conciliación de la corrida seleccionada.',
      fxDifferenceUsd: rows.filter(row => row.financialStatementCode === 'BALANCE' && row.statusCode === 'CONCILIADO_FX').reduce((sum, row) => sum + numberOf(row.differenceUsd), 0),
      documents: rows.map(row => ({ key: row.icDocumentId, statement: row.financialStatementCode, agreed: null, reportedUsd: numberOf(row.issuerUsd), result: reconciliationResult(row.statusCode) })),
    }
  }
}
