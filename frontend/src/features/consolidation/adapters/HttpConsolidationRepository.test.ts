import { describe, expect, it, vi } from 'vitest'
import type { HttpClient } from '@/shared/api/httpClient'
import type { KpiDto, RunDto } from '@/shared/api/backend'
import { HttpConsolidationRepository } from './HttpConsolidationRepository'
import { HttpProfitabilityRepository } from '@/features/profitability/adapters/HttpProfitabilityRepository'

const run: RunDto = {
  runId: 'new-v2', scenarioId: 'PPTO_V2', executedAt: '2026-11-21T17:00:00Z',
  lineageOk: true, parameterSnapshot: {}, ratesHash: 'hash', notes: null,
}
const kpi: KpiDto = {
  basisCode: 'CONSOLIDADO', companyId: null, salesUsd: '1000.25', ebitUsd: '200.50',
  workingCapitalUsd: '300', fixedAssetsUsd: '500', totalAssetsUsd: '1100',
  currentLiabilitiesUsd: '200', effectiveTaxRate: '0.25', wacc: '0.10',
  investedCapitalUsd: '800', capitalEmployedUsd: '900', nopatUsd: '150.375',
  roic: null, roce: '0.222778', evaUsd: '70.375',
}
function transport() {
  const payloads: Record<string, unknown> = {
    '/runs': [{ ...run, runId: 'v1', scenarioId: 'PPTO_V1' }, { ...run, runId: 'old-v2', executedAt: '2026-11-20T00:00:00Z' }, run],
    '/runs/new-v2/consolidated': { run, accounts: [
      { groupAccountId: '4100', name: 'Ventas', accountTypeCode: 'ING', accountCategoryCode: 'VENTAS', aggregatedUsd: '1100.25', eliminationsUsd: '-100', translationAdjustmentUsd: '0', consolidatedUsd: '1000.25' },
      { groupAccountId: '1100', name: 'Caja', accountTypeCode: 'ACT', accountCategoryCode: 'EFECTIVO', aggregatedUsd: '400', eliminationsUsd: '0', translationAdjustmentUsd: '0', consolidatedUsd: '400' },
    ] },
    '/runs/new-v2/kpis': { run, group: [kpi, { ...kpi, basisCode: 'AGREGADO', salesUsd: '1100.25', ebitUsd: '199', roic: '0.12' }], companies: [{ ...kpi, basisCode: 'EMPRESA', companyId: 'GT1' }] },
    '/runs/new-v2/reconciliation': { run, summary: {}, reconciliation: [{ icDocumentId: 'DOC1' }, { icDocumentId: 'DOC1' }] },
    '/companies': [{ companyId: 'GT1', name: 'Empresa real', functionalCurrencyCode: 'GTQ', countryCode: 'GT' }],
  }
  const get = vi.fn(async (path: string): Promise<unknown> => {
    if (!(path in payloads)) throw new Error('Ruta no publicada: ' + path)
    return payloads[path]
  })
  const http: HttpClient = {
    get: <T>(path: string) => get(path) as Promise<T>,
    post: async <T>() => undefined as T,
  }
  return { ...http, calls: get.mock.calls }
}

describe('adaptadores de corridas publicadas', () => {
  it('usa la última corrida del escenario, transforma decimales y no convierte NULL en cero', async () => {
    const http = transport()
    const summary = await new HttpConsolidationRepository(http).getSummary({ scenarioId: 'PPTO_V2', currency: 'USD' })
    expect(summary.runId).toBe('new-v2')
    expect(summary.sales).toEqual({ aggregate: 1100.25, eliminations: 100, consolidated: 1000.25, icDocuments: 1 })
    expect(summary.incomeStatement[0].consolidated).toBe(1000.25)
    expect(summary.balanceSheet[0].account).toBe('1100')
    expect(summary.kpis.find(row => row.code === 'ROIC')?.value).toBeNaN()
    expect(summary.lineage.accountsOk).toBeNaN()
    expect(summary.evaByCompany[0].name).toBe('Empresa real')
    expect(http.calls.map(call => call[0])).not.toContain('/scenarios/PPTO_V2/consolidation')
  })

  it('elige AGREGADO para sin eliminar y conserva métricas del servidor sin recalcular', async () => {
    const report = await new HttpProfitabilityRepository(transport()).getReport({ scenarioId: 'PPTO_V2', currency: 'USD' }, 'sin-eliminar')
    expect(report.kpis.find(row => row.code === 'ROIC')?.value).toBe(0.12)
    expect(report.kpis.find(row => row.code === 'EVA')?.components.find(row => row.label === 'WACC')?.value).toBe(0.1)
    expect(report.eliminationComparison.find(row => row.label === 'Ventas')).toEqual({ label: 'Ventas', left: 1100.25, right: 1000.25, unit: 'USD' })
    expect(report.unvalidatedComparison).toEqual([])
  })
})
