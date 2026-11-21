import { describe, expect, it, vi } from 'vitest'
import type { HttpClient } from '@/shared/api/httpClient'
import { HttpReconciliationRepository } from './HttpReconciliationRepository'
import { HttpValidationRepository } from '@/features/validation/adapters/HttpValidationRepository'
import { HttpCurrentAccountRepository } from '@/features/current-account/adapters/HttpCurrentAccountRepository'
import { HttpRatesRepository } from '@/features/rates/adapters/HttpRatesRepository'
import { HttpIcDocumentRepository } from '@/features/ic-document/adapters/HttpIcDocumentRepository'

const run = { runId: 'run-v2', scenarioId: 'PPTO_V2', executedAt: '2026-11-21T18:00:00Z', parameterSnapshot: { TOLERANCIA_FX_USD: 50, TOLERANCIA_FX_PCT: 0.02 } }
const reconciliation = { run, summary: {}, reconciliation: [{ icDocumentId: 'DOC-1', financialStatementCode: 'BALANCE', issuerCompanyId: 'GT1', receiverCompanyId: 'MX1', statusCode: 'CONCILIADO_FX', issuerUsd: '100', receiverUsd: '101', differenceUsd: '-1', lineRefs: 'file.csv#2' }] }
function client(responses: Record<string, unknown>): HttpClient {
  return { get: vi.fn((path: string) => Promise.resolve(responses[path])), post: vi.fn() } as HttpClient
}

describe('Adaptadores contra el contrato NestJS', () => {
  it('elige corrida del escenario, conserva decimales y resuelve tipo y monto pactado', async () => {
    const http = client({
      '/runs': [{ ...run, runId: 'other', scenarioId: 'PPTO_V1', executedAt: '2026-12-01' }, run],
      '/runs/run-v2/reconciliation': reconciliation,
    })
    const report = await new HttpReconciliationRepository(http).getReport({ scenarioId: 'PPTO_V2', currency: 'USD' }, {})
    expect(http.get).toHaveBeenCalledWith('/runs/run-v2/reconciliation', { signal: undefined })
    expect(report.pairs[0]).toMatchObject({ issuerUsd: 100, receiverUsd: 101, differenceUsd: -1, agreed: { currency: 'GTQ', amount: 100 }, type: 'VENTA' })
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

  it('QA-H14: HttpRatesRepository consulta GET /scenarios/:id/rates y construye la tabla de tasas', async () => {
    const http = client({
      '/scenarios/PPTO_V2/rates': {
        scenarioId: 'PPTO_V2',
        periodCode: null,
        ratesHash: 'hash123',
        historicalSnapshot: false,
        rows: [
          { currencyCode: 'GTQ', rateTypeCode: 'PRESUPUESTO', periodCode: '2027-01', usdPerUnit: '0.12820513' },
          { currencyCode: 'MXN', rateTypeCode: 'PRESUPUESTO', periodCode: '2027-01', usdPerUnit: '0.05347594' },
          { currencyCode: 'USD', rateTypeCode: 'PRESUPUESTO', periodCode: '2027-01', usdPerUnit: '1.0' },
        ],
        conversionRules: [],
        alerts: [],
      },
      '/scenarios/PPTO_V1/rates': {
        scenarioId: 'PPTO_V1',
        periodCode: null,
        ratesHash: 'hashv1',
        historicalSnapshot: false,
        rows: [
          { currencyCode: 'MXN', rateTypeCode: 'PRESUPUESTO', periodCode: '2027-01', usdPerUnit: '0.05555556' },
        ],
        conversionRules: [],
        alerts: [],
      },
      '/companies': [
        { companyId: 'GT1', functionalCurrencyCode: 'GTQ' },
        { companyId: 'MX1', functionalCurrencyCode: 'MXN' },
        { companyId: 'US1', functionalCurrencyCode: 'USD' },
      ],
      '/scenarios/PPTO_V2/findings': [],
      '/runs': [run],
      '/runs/run-v2/consolidated': { run, accounts: [{ groupAccountId: '3900', translationAdjustmentUsd: '-241412' }] },
    })
    const table = await new HttpRatesRepository(http).getTable({ scenarioId: 'PPTO_V2', currency: 'USD' })
    expect(table.version).toBe('V2')
    expect(table.rows).toHaveLength(3)
    const mxn = table.rows.find(r => r.currency === 'MXN')!
    expect(mxn.budget).toBeCloseTo(18.7, 1)
    expect(mxn.budgetPrevious).toBeCloseTo(18.0, 1)
    expect(table.ctaUsd).toBe(-241412)
  })

  it('QA-H15: HttpIcDocumentRepository consulta GET /ic-documents/:id y arma el detalle del documento IC', async () => {
    const http = client({
      '/ic-documents/IC-F1-2027-12': {
        icDocumentId: 'IC-F1-2027-12',
        version: 1,
        isCurrent: true,
        scenarioId: 'PPTO_V2',
        statusCode: 'CONCILIADA',
        statusReason: null,
        icDocumentTypeCode: 'VENTA',
        issuerCompanyId: 'GT1',
        receiverCompanyId: 'MX1',
        transactionCurrencyCode: 'GTQ',
        transactionAmount: '65000.00',
        periodCode: '2027-12',
        receivable: null,
        payable: { acceptedAt: '2026-11-21T10:00:00Z' },
        permissions: { canAccept: false, canDispute: false },
        sourceRefs: [],
      },
      '/runs': [run],
      '/runs/run-v2/reconciliation': {
        run,
        summary: {},
        reconciliation: [
          {
            icDocumentId: 'IC-F1-2027-12',
            financialStatementCode: 'BALANCE',
            issuerCompanyId: 'GT1',
            receiverCompanyId: 'MX1',
            statusCode: 'CONCILIADO_FX',
            issuerUsd: '8333.33',
            receiverUsd: '8411.77',
            differenceUsd: '-78.44',
            lineRefs: 'balance_GT1_V2.csv#fila8;balance_MX1_V2.csv#fila8',
          },
        ],
      },
    })
    const doc = await new HttpIcDocumentRepository(http).getDocument('IC-F1-2027-12', 'PPTO_V2')
    expect(doc.key).toBe('IC-F1-2027-12')
    expect(doc.type).toBe('VENTA')
    expect(doc.receivable.amount).toEqual({ currency: 'GTQ', amount: 65000 })
    expect(doc.payable.amount).toEqual({ currency: 'GTQ', amount: 65000 })
    expect(doc.result).toBe('CONCILIADO_FX')
    expect(doc.lineage.length).toBe(4)
  })
})
