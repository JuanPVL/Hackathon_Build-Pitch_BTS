import { describe, expect, it, vi } from 'vitest'
import type { HttpClient } from '@/shared/api/httpClient'
import { HttpEliminationRepository } from './HttpEliminationRepository'

describe('HttpEliminationRepository', () => {
  it('conserva el ledger firmado y no inventa patas contables', async () => {
    const get = vi.fn(async (path: string) => {
      const values: Record<string, unknown> = {
        '/runs': [{ runId: 'run', scenarioId: 'PPTO_V2', executedAt: '2027-01-01' }],
        '/runs/run/eliminations': { eliminations: [{ eliminationLineId: 7, eliminationCode: 'E1', eliminationRuleCode: 'E1', groupAccountId: '4200', effectUsd: '-100.25', icDocumentId: 'IC-7', companyId: 'GT1', sourceRef: 'fila7' }] },
        '/runs/run/consolidated': { accounts: [{ groupAccountId: '4200', name: 'Ventas IC', accountTypeCode: 'ING' }] },
        '/runs/run/kpis': { group: [
          { basisCode: 'AGREGADO', capitalEmployedUsd: '200', roce: '0.1', ebitUsd: '50' },
          { basisCode: 'CONSOLIDADO', capitalEmployedUsd: '100', roce: '0.2', ebitUsd: '51' },
        ] },
        '/runs/run/reconciliation': { reconciliation: [{ statusCode: 'CONCILIADO' }, { statusCode: 'SIN_CONTRAPARTE' }] },
      }
      if (!(path in values)) throw new Error(path)
      return values[path]
    })
    const repo = new HttpEliminationRepository({ get, post: vi.fn() } as unknown as HttpClient)
    const report = await repo.getReport({ scenarioId: 'PPTO_V2', currency: 'USD' })
    expect(report.entries).toEqual([])
    expect(report.ledger?.[0]).toMatchObject({ effectUsd: -100.25, document: 'IC-7', account: '4200', source: 'fila7' })
    expect(report.summary).toMatchObject({ pnl: 100.25, pending: 1, pairs: 1, ebitEffect: 1 })
    expect(report.capital.icRemoved).toBe(100)
  })
})
