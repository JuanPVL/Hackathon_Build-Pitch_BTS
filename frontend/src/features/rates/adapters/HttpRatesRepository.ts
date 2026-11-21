import type { HttpClient } from '@/shared/api/httpClient'
import { Backend, numberOf, type ScenarioRateRowDto } from '@/shared/api/backend'
import type { CompanyCode, CurrencyCode, ScenarioQuery } from '@/entities'
import type { RateAlert, RateRow, RatesTable } from '../domain/types'
import type { RatesRepository } from '../ports/RatesRepository'

const CURRENCY_NAMES: Record<CurrencyCode, string> = {
  GTQ: 'Quetzal',
  MXN: 'Peso mexicano',
  USD: 'Dólar',
}

const CURRENCY_ORDER: CurrencyCode[] = ['GTQ', 'MXN', 'USD']

function medianOf(values: number[]): number {
  const valid = values.filter(v => Number.isFinite(v) && v > 0).sort((a, b) => a - b)
  if (valid.length === 0) return 0
  const mid = Math.floor(valid.length / 2)
  return valid.length % 2 === 1 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2
}

function unitsPerUsdFromRows(rows: ScenarioRateRowDto[], currency: CurrencyCode, rateType: string): { unitsPerUsd: number; usdPerUnit: number } {
  const matching = rows
    .filter(r => r.currencyCode === currency && r.rateTypeCode === rateType)
    .map(r => numberOf(r.usdPerUnit))
    .filter(v => Number.isFinite(v) && v > 0)
  if (matching.length === 0) return { unitsPerUsd: 0, usdPerUnit: 0 }
  // Para CIERRE/HISTORICA tomamos el cierre (2027-12 o el último periodo); para PRESUPUESTO usamos la mediana para no distorsionar con un mes puntual invertido.
  const usdRate = rateType === 'PRESUPUESTO' ? medianOf(matching) : matching[matching.length - 1]
  return {
    usdPerUnit: usdRate,
    unitsPerUsd: usdRate > 0 ? 1 / usdRate : 0,
  }
}

export class HttpRatesRepository implements RatesRepository {
  private readonly backend: Backend
  constructor(http: HttpClient) {
    this.backend = new Backend(http)
  }

  async getTable(query: ScenarioQuery, signal?: AbortSignal): Promise<RatesTable> {
    const previousScenarioId = query.scenarioId === 'PPTO_V2' ? 'PPTO_V1' : null

    const [currentRates, previousRates, companies, findings, latestRun] = await Promise.all([
      this.backend.rates(query.scenarioId, undefined, signal),
      previousScenarioId ? this.backend.rates(previousScenarioId, undefined, signal).catch(() => null) : Promise.resolve(null),
      this.backend.companies(signal).catch(() => []),
      this.backend.findings(query.scenarioId, signal).catch(() => []),
      this.backend.latestRun(query.scenarioId, signal).catch(() => null),
    ])

    let ctaUsd = 0
    let controlBandPct = 25
    if (latestRun) {
      const bandParam = numberOf(latestRun.parameterSnapshot?.BANDA_TASA_PCT)
      if (Number.isFinite(bandParam) && bandParam > 0) {
        controlBandPct = bandParam < 1 ? Math.round(bandParam * 100) : Math.round(bandParam)
      }
      const consolidated = await this.backend.consolidated(latestRun.runId, signal).catch(() => null)
      const ctaAccount = consolidated?.accounts.find(a => a.groupAccountId === '3900')
      if (ctaAccount) {
        const val = numberOf(ctaAccount.translationAdjustmentUsd ?? ctaAccount.consolidatedUsd)
        if (Number.isFinite(val)) ctaUsd = val
      }
    }

    const rows: RateRow[] = CURRENCY_ORDER.map((currency): RateRow => {
      const currencyCompanies = companies
        .filter(c => c.functionalCurrencyCode === currency)
        .map(c => c.companyId)
      const fallbackCompanies: Record<CurrencyCode, CompanyCode[]> = {
        GTQ: ['GT1', 'GT2'],
        MXN: ['MX1', 'MX2'],
        USD: ['US1', 'US2'],
      }
      const budget = unitsPerUsdFromRows(currentRates.rows, currency, 'PRESUPUESTO')
      const closing = unitsPerUsdFromRows(currentRates.rows, currency, 'CIERRE')
      const historical = unitsPerUsdFromRows(currentRates.rows, currency, 'HISTORICA')
      const prevBudget = previousRates ? unitsPerUsdFromRows(previousRates.rows, currency, 'PRESUPUESTO') : null

      return {
        currency,
        name: CURRENCY_NAMES[currency],
        companies: currencyCompanies.length > 0 ? currencyCompanies : fallbackCompanies[currency],
        budgetPrevious: prevBudget && prevBudget.unitsPerUsd > 0 ? prevBudget.unitsPerUsd : null,
        budget: budget.unitsPerUsd,
        closing: closing.unitsPerUsd || budget.unitsPerUsd,
        historical: historical.unitsPerUsd || closing.unitsPerUsd || budget.unitsPerUsd,
        budgetToUsd: budget.usdPerUnit,
      }
    })

    const alerts: RateAlert[] = []
    for (const a of currentRates.alerts ?? []) {
      alerts.push({
        severity: a.severityCode === 'B' ? 'BLOQUEANTE' : 'INFO',
        title: a.ruleCode ? `${a.message} (${a.ruleCode})` : a.message,
        detail: [a.currencyCode, a.periodCode].filter(Boolean).join(' · '),
        rule: a.ruleCode ?? undefined,
      })
    }

    for (const f of findings.filter(item => item.ruleCode === 'V08')) {
      if (!alerts.some(a => a.rule === 'V08')) {
        alerts.push({
          severity: f.severityCode === 'B' ? 'BLOQUEANTE' : 'INFO',
          title: `Tasa fuera de banda (${f.ruleCode})`,
          detail: f.message,
          rule: f.ruleCode,
        })
      }
    }

    const mxnRow = rows.find(r => r.currency === 'MXN')
    if (mxnRow && mxnRow.budgetPrevious && Math.abs(mxnRow.budget - mxnRow.budgetPrevious) > 0.01) {
      alerts.push({
        severity: 'INFO',
        title: `V1 → V2: el peso pasó de ${mxnRow.budgetPrevious.toFixed(2)} a ${mxnRow.budget.toFixed(2)}`,
        detail: 'El impacto cambiario por empresa y cuenta se explica en Desviaciones.',
      })
    }

    const versionLabel = query.scenarioId.replace(/^PPTO_/, '')

    return {
      version: versionLabel,
      status: 'VIGENTE',
      appliedTo: companies.length || 6,
      rows,
      conversionRules: [
        { scope: 'Resultados (P&L)', rateType: 'PRESUPUESTO' },
        { scope: 'Activos y pasivos (Balance)', rateType: 'CIERRE' },
        { scope: 'Capital social (cuenta 3100)', rateType: 'HISTORICA' },
      ],
      ctaUsd,
      controlBandPct,
      alerts,
    }
  }
}
