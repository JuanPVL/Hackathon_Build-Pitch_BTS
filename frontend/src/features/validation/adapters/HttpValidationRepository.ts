import { ApiError } from '@/shared/api/httpClient'
import type { HttpClient } from '@/shared/api/httpClient'
import { Backend, numberOf } from '@/shared/api/backend'
import type { ScenarioQuery } from '@/entities'
import type { ValidationReport } from '../domain/types'
import type { ValidationRepository } from '../ports/ValidationRepository'
import { countBySeverity } from '../domain/validation'

export class HttpValidationRepository implements ValidationRepository {
  private readonly backend: Backend
  constructor(http: HttpClient) { this.backend = new Backend(http) }

  async getReport(query: ScenarioQuery, signal?: AbortSignal): Promise<ValidationReport> {
    const [companies, loads, rows] = await Promise.all([
      this.backend.companies(signal), this.backend.loads(query.scenarioId, signal),
      this.backend.findings(query.scenarioId, signal),
    ])
    const findings = rows.map(row => ({
      id: String(row.findingId), rule: row.ruleCode, severity: row.severityCode,
      scope: row.companyCode ?? 'GRUPO', record: row.recordRef ?? '', message: row.message,
      found: row.foundValue ?? undefined, expected: row.expectedValue ?? undefined,
      suggestion: row.suggestion ?? undefined, impactUsd: numberOf(row.impactUsd),
    })).sort((a, b) => Math.abs(b.impactUsd) - Math.abs(a.impactUsd))
    const totals = countBySeverity(findings)
    const summaries = companies.map(company => {
      const companyLoads = loads.filter(load => load.companyId === company.companyId)
      const latest = (statement: string) => companyLoads.filter(load => load.financialStatementCode === statement)
        .sort((a, b) => b.version - a.version)[0]?.statusCode ?? null
      return {
        owner: company.companyId, currency: company.functionalCurrencyCode,
        budget: latest('PYG'), balance: latest('BALANCE'),
        findings: rows.filter(row => row.companyCode === company.companyId || companyLoads.some(load => load.loadId === row.loadId)).length,
      }
    })
    return {
      publishable: loads.length > 0 && summaries.length > 0 && summaries.every(load => load.budget === 'APROBADA' && load.balance === 'APROBADA') && totals.blocking === 0,
      loads: summaries, totals, findings, canAcceptCorrection: false,
    }
  }

  async acceptCorrection(): Promise<void> {
    throw new ApiError(501, 'El backend todavía no permite aceptar correcciones desde la aplicación.')
  }
}
