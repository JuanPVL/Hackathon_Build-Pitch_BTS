import { describe, expect, it, vi } from 'vitest'
import type { HttpClient } from '@/shared/api/httpClient'
import { HttpReconciliationRepository } from './HttpReconciliationRepository'
import { HttpValidationRepository } from '@/features/validation/adapters/HttpValidationRepository'
import { HttpCurrentAccountRepository } from '@/features/current-account/adapters/HttpCurrentAccountRepository'

const run = { runId: 'run-v2', scenarioId: 'PPTO_V2', executedAt: '2026-11-21T18:00:00Z', parameterSnapshot: { TOLERANCIA_FX_USD: 50, TOLERANCIA_FX_PCT: 0.02 } }
const reconciliation = { run, summary: {}, reconciliation: [{ icDocumentId: 'DOC-1', financialStatementCode: 'BALANCE', issuerCompanyId: 'GT1', receiverCompanyId: 'MX1', statusCode: 'CONCILIADO_FX', issuerUsd: '100', receiverUsd: '101', differenceUsd: '-1', lineRefs: 'file.csv#2' }] }
function client(responses: Record<string, unknown>): HttpClient {
  return { get: vi.fn((path: string) => Promise.resolve(responses[path])), post: vi.fn() } as HttpClient
}

describe('Adaptadores contra el contrato NestJS', () => {
  it('elige corrida del escenario, conserva decimales y no inventa monto pactado o tipo', async () => {
    const http = client({
      '/runs': [{ ...run, runId: 'other', scenarioId: 'PPTO_V1', executedAt: '2026-12-01' }, run],
      '/runs/run-v2/reconciliation': reconciliation,
    })
    const report = await new HttpReconciliationRepository(http).getReport({ scenarioId: 'PPTO_V2', currency: 'USD' }, {})
    expect(http.get).toHaveBeenCalledWith('/runs/run-v2/reconciliation', { signal: undefined })
    expect(report.pairs[0]).toMatchObject({ issuerUsd: 100, receiverUsd: 101, differenceUsd: -1, agreed: null, type: null })
    expect(report.totals).toMatchObject({ documents: 1, reconciled: 1, fx: 1 })
  })

  it('sin hallazgos no publica si una carga sigue pendiente de aprobación', async () => {
    const http = client({
      '/companies': [{ companyId: 'GT1', functionalCurrencyCode: 'GTQ' }],
      '/loads': [{ companyId: 'GT1', financialStatementCode: 'PYG', version: 1, statusCode: 'RECIBIDA' }, { companyId: 'GT1', financialStatementCode: 'BALANCE', version: 1, statusCode: 'APROBADA' }],
      '/scenarios/PPTO_V2/findings': [],
    })
    const report = await new HttpValidationRepository(http).getReport({ scenarioId: 'PPTO_V2', currency: 'USD' })
    expect(report.publishable).toBe(false)
    expect(report.canAcceptCorrection).toBe(false)
    await expect(new HttpValidationRepository(http).acceptCorrection()).rejects.toMatchObject({ status: 501 })
  })

  it('usa la matriz de saldos real y señala que recibido es facturado transpuesto', async () => {
    const http = client({
      '/runs': [run], '/companies': [{ companyId: 'GT1' }, { companyId: 'MX1' }],
      '/runs/run-v2/reconciliation': reconciliation,
      '/runs/run-v2/ic-matrix': { run, billed: [{ issuerCompanyId: 'GT1', receiverCompanyId: 'MX1', billedUsd: '100' }], balances: [{ companyId: 'GT1', partnerCompanyId: 'MX1', balanceUsd: '100' }] },
    })
    const matrix = await new HttpCurrentAccountRepository(http).getMatrix({ scenarioId: 'PPTO_V2', currency: 'USD' }, 'recibido')
    expect(matrix.cells[0]).toMatchObject({ company: 'MX1', counterparty: 'GT1', balanceUsd: 100 })
    expect(matrix.receivedIsBilledTranspose).toBe(true)
  })
})
