import { ApiError, type HttpClient } from '@/shared/api/httpClient'
import { Backend, groupKpi, numberOf } from '@/shared/api/backend'
import type { CompanyCode } from '@/entities'
import type { VarianceBridge, BridgeRequest, BridgeEffect, CompanyEffect, EffectCode } from '../domain/types'
import type { VarianceRepository } from '../ports/VarianceRepository'

const LABELS: Record<string, string> = {
  VOLUMEN: 'Volumen', PRECIO: 'Precio', TIPO_CAMBIO: 'Tipo de cambio',
  COSTO_VENTAS: 'Costo de ventas', GASTO_OPERATIVO: 'Gasto operativo',
  IC_NEUTRAL: 'Intercompany neutral en consolidado',
  EBIT_DESPUES_IMPUESTOS: 'EBIT después de impuestos',
  TASA_IMPUESTO: 'Tasa efectiva de impuesto', WACC: 'WACC',
  CAPITAL_INVERTIDO: 'Capital invertido',
}

export class HttpVarianceRepository implements VarianceRepository {
  private readonly api: Backend
  constructor(http: HttpClient) { this.api = new Backend(http) }

  async getBridge(request: BridgeRequest, signal?: AbortSignal): Promise<VarianceBridge> {
    const [runs, bridges] = await Promise.all([this.api.runs(signal), this.api.bridges(signal)])
    const scenarioOf = new Map(runs.map(run => [run.runId, run.scenarioId]))
    // A bridge is pinned to its original two runs, even after a new run is generated.
    const bridge = bridges.filter(row =>
      scenarioOf.get(row.fromRunId) === request.from && scenarioOf.get(row.toRunId) === request.to,
    ).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    if (!bridge) throw new ApiError(404, 'Todavía no hay un puente calculado entre estos escenarios.')
    const [detail, check, fromKpis, toKpis] = await Promise.all([
      this.api.bridge(bridge.bridgeId, signal), this.api.bridgeCheck(bridge.bridgeId, signal),
      this.api.kpis(bridge.fromRunId, signal), this.api.kpis(bridge.toRunId, signal),
    ])
    const from = groupKpi(fromKpis)
    const to = groupKpi(toKpis)
    const field = request.metric === 'VENTAS' ? 'salesUsd' : request.metric === 'EVA' ? 'evaUsd' : 'ebitUsd'
    const effectsByCode = new Map<string, { value: number; companies: Set<CompanyCode> }>()
    const companyEffects = new Map<string, CompanyEffect>()
    if (request.metric === 'EVA') {
      for (const row of detail.eva) effectsByCode.set(row.effectCode, { value: numberOf(row.evaDeltaUsd), companies: new Set() })
      const fromByComp = new Map((fromKpis.companies ?? []).map(c => [c.companyId, c]))
      for (const toComp of toKpis.companies ?? []) {
        if (!toComp.companyId) continue
        const fromComp = fromByComp.get(toComp.companyId)
        const deltaEva = numberOf(toComp.evaUsd) - numberOf(fromComp?.evaUsd ?? 0)
        if (Number.isFinite(deltaEva)) {
          companyEffects.set(`EVA|${toComp.companyId}`, {
            effect: 'EBIT_DESPUES_IMPUESTOS',
            label: 'Variación de EVA (NOPAT − cargo de capital)',
            company: toComp.companyId,
            value: deltaEva,
          })
        }
      }
      if (companyEffects.size === 0) {
        for (const row of detail.lines) {
          const value = numberOf(row.ebitDeltaUsd)
          const key = row.effectCode + '|' + row.companyId
          const company = companyEffects.get(key) ?? {
            effect: row.effectCode as EffectCode, label: LABELS[row.effectCode] ?? row.effectCode, company: row.companyId, value: 0,
          }
          company.value += value
          companyEffects.set(key, company)
        }
      }
    } else {
      for (const row of detail.lines) {
        const value = numberOf(request.metric === 'VENTAS' ? row.salesDeltaUsd : row.ebitDeltaUsd)
        const effect = effectsByCode.get(row.effectCode) ?? { value: 0, companies: new Set<CompanyCode>() }
        effect.value += value
        effect.companies.add(row.companyId)
        effectsByCode.set(row.effectCode, effect)
        const key = row.effectCode + '|' + row.companyId
        const company = companyEffects.get(key) ?? {
          effect: row.effectCode as EffectCode, label: LABELS[row.effectCode] ?? row.effectCode, company: row.companyId, value: 0,
        }
        company.value += value
        companyEffects.set(key, company)
      }
    }
    const effects: BridgeEffect[] = [...effectsByCode].map(([code, row]) => ({
      id: code, code: code as EffectCode, label: LABELS[code] ?? code,
      value: row.value, companies: [...row.companies].sort(),
    }))
    const fromValue = numberOf(from[field])
    const toValue = numberOf(to[field])
    return {
      metric: request.metric,
      from: { scenarioId: request.from, label: request.from, value: fromValue },
      to: { scenarioId: request.to, label: request.to, value: toValue },
      effects,
      residual: toValue - fromValue - effects.reduce((sum, effect) => sum + effect.value, 0),
      byCompany: [...companyEffects.values()],
      eva: {
        from: numberOf(from.evaUsd), to: numberOf(to.evaUsd),
        effects: detail.eva.map(row => ({ label: LABELS[row.effectCode] ?? row.effectCode, value: numberOf(row.evaDeltaUsd) })),
      },
      narrative: null,
      bridgeId: bridge.bridgeId,
      balanced: check.isBalanced,
    }
  }
}
