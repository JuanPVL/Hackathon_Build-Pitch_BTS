import { describe, expect, it, vi } from 'vitest'
import type { HttpClient } from '@/shared/api/httpClient'
import { HttpVarianceRepository } from './HttpVarianceRepository'

describe('HttpVarianceRepository', () => {
  it('usa las corridas fijadas al bridge aunque existan corridas nuevas y preserva los códigos SQL', async () => {
    const get = vi.fn(async (path: string) => {
      const values: Record<string, unknown> = {
        '/runs': [
          { runId: 'new-v1', scenarioId: 'PPTO_V1', executedAt: '2027-02-01' },
          { runId: 'new-v2', scenarioId: 'PPTO_V2', executedAt: '2027-02-01' },
          { runId: 'old-v1', scenarioId: 'PPTO_V1', executedAt: '2027-01-01' },
          { runId: 'old-v2', scenarioId: 'PPTO_V2', executedAt: '2027-01-01' },
        ],
        '/bridges': [{ bridgeId: 'bridge', fromRunId: 'old-v1', toRunId: 'old-v2', createdAt: '2027-01-01' }],
        '/bridges/bridge': {
          lines: [{ effectCode: 'COSTO_VENTAS', companyId: 'GT1', salesDeltaUsd: '0', ebitDeltaUsd: '-12.50' }],
          eva: [{ effectCode: 'WACC', evaDeltaUsd: '-5' }],
        },
        '/bridges/bridge/check': { isBalanced: true },
        '/runs/old-v1/kpis': { group: [{ basisCode: 'CONSOLIDADO', ebitUsd: '100', evaUsd: '20' }] },
        '/runs/old-v2/kpis': { group: [{ basisCode: 'CONSOLIDADO', ebitUsd: '87.50', evaUsd: '15' }] },
      }
      if (!(path in values)) throw new Error('Ruta no publicada: ' + path)
      return values[path]
    })
    const repo = new HttpVarianceRepository({ get, post: vi.fn() } as unknown as HttpClient)
    const result = await repo.getBridge({ from: 'PPTO_V1', to: 'PPTO_V2', metric: 'EBIT' })
    expect(result.effects[0]).toMatchObject({ code: 'COSTO_VENTAS', value: -12.5, companies: ['GT1'] })
    expect(result.from.value).toBe(100)
    expect(result.to.value).toBe(87.5)
    expect(result.residual).toBe(0)
    expect(result.narrative).toBeNull()
    expect(get).not.toHaveBeenCalledWith('/runs/new-v2/kpis', expect.anything())
  })
})
