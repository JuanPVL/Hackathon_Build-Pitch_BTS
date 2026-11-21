import type { HttpClient } from '@/shared/api/httpClient'
import { Backend, groupKpi, numberOf } from '@/shared/api/backend'
import type { ScenarioQuery } from '@/entities'
import type { KpiBreakdown, ProfitabilityReport, ProfitabilityView } from '../domain/types'
import type { ProfitabilityRepository } from '../ports/ProfitabilityRepository'

/** Los indicadores y sus componentes vienen de las vistas KPI de NestJS. */
export class HttpProfitabilityRepository implements ProfitabilityRepository {
  private readonly backend: Backend
  constructor(http: HttpClient) { this.backend = new Backend(http) }

  async getReport(query: ScenarioQuery, view: ProfitabilityView, signal?: AbortSignal): Promise<ProfitabilityReport> {
    const run = await this.backend.latestRun(query.scenarioId, signal)
    const [data, companies] = await Promise.all([
      this.backend.kpis(run.runId, signal), this.backend.companies(signal),
    ])
    const consolidated = groupKpi(data)
    const aggregate = groupKpi(data, 'AGREGADO')
    const selected = view === 'sin-eliminar' ? aggregate : consolidated
    const names = new Map(companies.map(company => [company.companyId, company.name]))
    const kpis: KpiBreakdown[] = [
      {
        code: 'ROIC', value: numberOf(selected.roic), unit: 'RATIO',
        formula: 'ROIC = NOPAT ÷ capital invertido',
        components: [
          { label: 'NOPAT', value: numberOf(selected.nopatUsd), unit: 'USD' },
          { label: 'Capital invertido', value: numberOf(selected.investedCapitalUsd), unit: 'USD' },
          { label: 'Tasa efectiva de impuesto', value: numberOf(selected.effectiveTaxRate), unit: 'RATIO' },
        ],
        note: 'Indicador calculado por la base para la corrida seleccionada.',
      },
      {
        code: 'ROCE', value: numberOf(selected.roce), unit: 'RATIO',
        formula: 'ROCE = EBIT ÷ capital empleado',
        components: [
          { label: 'EBIT', value: numberOf(selected.ebitUsd), unit: 'USD' },
          { label: 'Capital empleado', value: numberOf(selected.capitalEmployedUsd), unit: 'USD' },
          { label: 'Activo total', value: numberOf(selected.totalAssetsUsd), unit: 'USD' },
          { label: 'Pasivo corriente', value: numberOf(selected.currentLiabilitiesUsd), unit: 'USD' },
        ],
        note: 'Capital empleado = activo total − pasivo corriente.',
      },
      {
        code: 'EVA', value: numberOf(selected.evaUsd), unit: 'USD',
        formula: 'EVA = NOPAT − WACC × capital invertido',
        components: [
          { label: 'NOPAT', value: numberOf(selected.nopatUsd), unit: 'USD' },
          { label: 'WACC', value: numberOf(selected.wacc), unit: 'RATIO' },
          { label: 'Capital invertido', value: numberOf(selected.investedCapitalUsd), unit: 'USD' },
        ],
        note: 'WACC corresponde al parámetro congelado de esta corrida.',
      },
    ]
    return {
      view, wacc: numberOf(selected.wacc), effectiveTaxRate: numberOf(selected.effectiveTaxRate), kpis,
      byCompany: data.companies.flatMap(row => row.companyId ? [{
        company: row.companyId, name: names.get(row.companyId) ?? row.companyId,
        roic: numberOf(row.roic), roce: numberOf(row.roce), eva: numberOf(row.evaUsd),
      }] : []),
      eliminationComparison: [
        { label: 'Ventas', left: numberOf(aggregate.salesUsd), right: numberOf(consolidated.salesUsd), unit: 'USD' },
        { label: 'EBIT', left: numberOf(aggregate.ebitUsd), right: numberOf(consolidated.ebitUsd), unit: 'USD' },
        { label: 'Capital empleado', left: numberOf(aggregate.capitalEmployedUsd), right: numberOf(consolidated.capitalEmployedUsd), unit: 'USD' },
        { label: 'ROIC', left: numberOf(aggregate.roic), right: numberOf(consolidated.roic), unit: 'RATIO' },
        { label: 'ROCE', left: numberOf(aggregate.roce), right: numberOf(consolidated.roce), unit: 'RATIO' },
        { label: 'EVA', left: numberOf(aggregate.evaUsd), right: numberOf(consolidated.evaUsd), unit: 'USD' },
      ],
      // No hay endpoint de indicadores sin validar: no se compara contra cifras de muestra.
      unvalidatedComparison: [],
    }
  }
}
