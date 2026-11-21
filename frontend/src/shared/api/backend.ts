import { ApiError } from './httpClient'
import type { HttpClient } from './httpClient'
import type { CompanyCode, CurrencyCode, LoadStatus } from '@/entities'
import type { Severity } from '@/features/validation/domain/types'

export type Decimal = string | number | null
export interface CompanyDto { companyId: CompanyCode; name: string; functionalCurrencyCode: CurrencyCode; countryCode: string }
export interface RunDto {
  runId: string; scenarioId: string; executedAt: string; lineageOk: boolean | null
  parameterSnapshot: Record<string, unknown> | null; ratesHash: string | null; notes: string | null
}
export interface LoadDto {
  loadId: string; companyId: CompanyCode; scenarioId: string; financialStatementCode: string
  version: number; fileName: string; statusCode: LoadStatus; statusReason: string | null
}
export interface LoadDetailDto extends LoadDto { lines: Record<string, unknown>[] }
export interface FindingDto {
  findingId: number | string; loadId: string | null; severityCode: Severity; ruleCode: string
  companyCode: string | null; recordRef: string | null; message: string; impactUsd: Decimal
  foundValue: string | null; expectedValue: string | null; suggestion: string | null
}
export interface AccountDto {
  groupAccountId: string; name: string; accountTypeCode: string; accountCategoryCode: string
  aggregatedUsd: Decimal; eliminationsUsd: Decimal; translationAdjustmentUsd: Decimal; consolidatedUsd: Decimal
}
export interface KpiDto {
  basisCode: string; companyId: CompanyCode | null; salesUsd: Decimal; ebitUsd: Decimal
  workingCapitalUsd: Decimal; fixedAssetsUsd: Decimal; totalAssetsUsd: Decimal
  currentLiabilitiesUsd: Decimal; effectiveTaxRate: Decimal; wacc: Decimal
  investedCapitalUsd: Decimal; capitalEmployedUsd: Decimal; nopatUsd: Decimal
  roic: Decimal; roce: Decimal; evaUsd: Decimal
}
export interface KpisDto { run: RunDto; group: KpiDto[]; companies: KpiDto[] }
export interface ReconciliationDto {
  icDocumentId: string; financialStatementCode: string; issuerCompanyId: CompanyCode | null
  receiverCompanyId: CompanyCode | null; statusCode: string
  issuerUsd: Decimal; receiverUsd: Decimal; differenceUsd: Decimal; lineRefs: string | null
}
export interface ReconciliationResponse { run: RunDto; summary: Record<string, number>; reconciliation: ReconciliationDto[] }
export interface EliminationDto {
  eliminationLineId: number; eliminationCode: string; eliminationRuleCode: string
  icDocumentId: string | null; companyId: CompanyCode | null; groupAccountId: string
  effectUsd: Decimal; sourceRef: string | null
}
export interface MatrixDto {
  run: Pick<RunDto, 'runId' | 'scenarioId'>
  billed: { issuerCompanyId: CompanyCode; receiverCompanyId: CompanyCode; billedUsd: Decimal }[]
  balances: { companyId: CompanyCode; partnerCompanyId: CompanyCode; balanceUsd: Decimal }[]
}
export interface BridgeDto { bridgeId: string; fromRunId: string; toRunId: string; createdAt: string; notes: string | null }
export interface BridgeDetailDto extends BridgeDto {
  lines: { bridgeLineId: number; effectCode: string; companyId: CompanyCode; salesDeltaUsd: Decimal; ebitDeltaUsd: Decimal }[]
  eva: { effectCode: string; evaDeltaUsd: Decimal }[]
}
export interface BridgeCheckDto { isBalanced: boolean; bridgeSalesDeltaUsd: Decimal; kpiSalesDeltaUsd: Decimal; bridgeEbitDeltaUsd: Decimal; kpiEbitDeltaUsd: Decimal; bridgeEvaDeltaUsd: Decimal; kpiEvaDeltaUsd: Decimal }
export interface MeDto {
  userId: string; dbUserId: string | null; dbRole: string
  grants: { companyId: string | null; roleCode: string }[]
  permissions: Record<'readAll' | 'writeAll' | 'approveLoads' | 'masterData', boolean>
}
export type AccessRoleCode = 'GROUP_CONTROLLER' | 'AUDITOR' | 'COMPANY_ACCOUNTANT' | 'COMPANY_VIEWER'
export interface AdminUserGrantDto {
  accessId: number; userId: string; companyId: CompanyCode | null; roleCode: AccessRoleCode
  isActive: boolean; createdAt: string; createdBy: string | null; updatedAt: string | null; updatedBy: string | null
}
export interface AdminUserDto {
  userId: string; email: string | null; roleCode: AccessRoleCode | null; companyId: CompanyCode | null
  isActive: boolean; grants: AdminUserGrantDto[]
}
export interface CreateAdminUserInput {
  email: string; password: string; roleCode: AccessRoleCode; companyId: CompanyCode | null
}
export interface UpdateAdminUserAccessInput {
  roleCode?: AccessRoleCode; companyId?: CompanyCode | null; isActive?: boolean
}
export interface ScenarioRateRowDto {
  currencyCode: CurrencyCode; rateTypeCode: 'PRESUPUESTO' | 'PROMEDIO' | 'CIERRE' | 'HISTORICA' | string
  periodCode: string; usdPerUnit: Decimal
}
export interface ScenarioRatesResponseDto {
  scenarioId: string; periodCode: string | null; ratesHash: string | null; historicalSnapshot: boolean
  rows: ScenarioRateRowDto[]
  conversionRules: { scope: string; rateTypeCode: string }[]
  alerts: { severityCode: string; ruleCode: string | null; message: string; periodCode: string | null; currencyCode: string | null }[]
}
export interface IcDocumentReceivableDto {
  companyId: CompanyCode; partnerCompanyId: CompanyCode; currencyCode: CurrencyCode; amount: Decimal; balance: Decimal
}
export interface IcDocumentPayableDto extends IcDocumentReceivableDto {
  acceptedBy: string | null; acceptedAt: string | null
}
export interface IcDocumentSourceRefDto {
  loadId: string; lineId: string; rowNumber: number; fileName: string
}
export interface IcDocumentDto {
  icDocumentId: string; version: number; isCurrent: boolean; scenarioId: string
  statusCode: string; statusReason: string | null; icDocumentTypeCode: string
  issuerCompanyId: CompanyCode; receiverCompanyId: CompanyCode
  transactionCurrencyCode: CurrencyCode; transactionAmount: Decimal; periodCode: string
  receivable: IcDocumentReceivableDto | null; payable: IcDocumentPayableDto | null
  permissions: { canAccept: boolean; canDispute: boolean }
  sourceRefs: IcDocumentSourceRefDto[]
}
export interface DocumentActionDto { icDocumentId: string; version: number; statusCode: string; statusReason: string | null }

/** Contrato de las operaciones publicadas en /api/openapi.json. Sin acceso directo a tablas. */
export class Backend {
  constructor(readonly http: HttpClient) {}
  health(signal?: AbortSignal) { return this.http.get<{ status: string }>('/health', { signal }) }
  me(signal?: AbortSignal) { return this.http.get<MeDto>('/me', { signal }) }
  companies(signal?: AbortSignal) { return this.http.get<CompanyDto[]>('/companies', { signal }) }
  loads(scenarioId: string, signal?: AbortSignal) { return this.http.get<LoadDto[]>('/loads', { query: { scenarioId }, signal }) }
  load(id: string, signal?: AbortSignal) { return this.http.get<LoadDetailDto>(`/loads/${encodeURIComponent(id)}`, { signal }) }
  rates(scenarioId: string, periodCode?: string, signal?: AbortSignal) {
    return this.http.get<ScenarioRatesResponseDto>(`/scenarios/${encodeURIComponent(scenarioId)}/rates`, { query: periodCode ? { periodCode } : undefined, signal })
  }
  icDocument(id: string, query?: { scenarioId?: string; version?: number }, signal?: AbortSignal) {
    return this.http.get<IcDocumentDto>(`/ic-documents/${encodeURIComponent(id)}`, { query, signal })
  }
  uploadLoad(form: FormData) { return this.http.post<LoadDto & { rowCount: number; fileHash: string | null }>('/loads/upload', form) }
  validateLoad(id: string) { return this.http.post<{ loadId: string; statusCode: LoadStatus; findingsCount: number; findings: FindingDto[] }>(`/loads/${encodeURIComponent(id)}/validate`) }
  approveLoad(id: string, justification?: string) { return this.http.post<LoadDto>(`/loads/${encodeURIComponent(id)}/approve`, justification ? { justification } : {}) }
  adminUsers(signal?: AbortSignal) { return this.http.get<AdminUserDto[]>('/admin/users', { signal }) }
  createAdminUser(input: CreateAdminUserInput) { return this.http.post<AdminUserDto>('/admin/users', input) }
  updateAdminUserAccess(userId: string, input: UpdateAdminUserAccessInput) {
    if (this.http.patch) return this.http.patch<AdminUserDto>(`/admin/users/${encodeURIComponent(userId)}/access`, input)
    return this.http.post<AdminUserDto>(`/admin/users/${encodeURIComponent(userId)}/access`, input)
  }
  findings(scenarioId: string, signal?: AbortSignal) { return this.http.get<FindingDto[]>(`/scenarios/${encodeURIComponent(scenarioId)}/findings`, { signal }) }
  consolidate(scenarioId: string) { return this.http.post<{ run: RunDto; reconciliation: Record<string, number> }>(`/scenarios/${encodeURIComponent(scenarioId)}/consolidate`) }
  runs(signal?: AbortSignal) { return this.http.get<RunDto[]>('/runs', { signal }) }
  async latestRun(scenarioId: string, signal?: AbortSignal) {
    const runs = await this.runs(signal)
    const run = runs.filter(r => r.scenarioId === scenarioId).sort((a, b) => b.executedAt.localeCompare(a.executedAt))[0]
    if (!run) throw new ApiError(404, 'Todavía no hay una corrida para este escenario. Ejecuta la consolidación.')
    return run
  }
  run(id: string, signal?: AbortSignal) { return this.http.get<{ run: RunDto; loads: LoadDto[] }>(`/runs/${encodeURIComponent(id)}`, { signal }) }
  consolidated(id: string, signal?: AbortSignal) { return this.http.get<{ run: RunDto; accounts: AccountDto[] }>(`/runs/${encodeURIComponent(id)}/consolidated`, { signal }) }
  eliminations(id: string, signal?: AbortSignal) { return this.http.get<{ run: RunDto; eliminations: EliminationDto[] }>(`/runs/${encodeURIComponent(id)}/eliminations`, { signal }) }
  reconciliation(id: string, signal?: AbortSignal) { return this.http.get<ReconciliationResponse>(`/runs/${encodeURIComponent(id)}/reconciliation`, { signal }) }
  matrix(id: string, signal?: AbortSignal) { return this.http.get<MatrixDto>(`/runs/${encodeURIComponent(id)}/ic-matrix`, { signal }) }
  kpis(id: string, signal?: AbortSignal) { return this.http.get<KpisDto>(`/runs/${encodeURIComponent(id)}/kpis`, { signal }) }
  bridges(signal?: AbortSignal) { return this.http.get<BridgeDto[]>('/bridges', { signal }) }
  bridge(id: string, signal?: AbortSignal) { return this.http.get<BridgeDetailDto>(`/bridges/${encodeURIComponent(id)}`, { signal }) }
  bridgeCheck(id: string, signal?: AbortSignal) { return this.http.get<BridgeCheckDto>(`/bridges/${encodeURIComponent(id)}/check`, { signal }) }
  acceptDocument(id: string, version: number) { return this.http.post<DocumentActionDto>(`/ic-documents/${encodeURIComponent(id)}/accept`, { version }) }
  disputeDocument(id: string, version: number, reason: string) { return this.http.post<DocumentActionDto>(`/ic-documents/${encodeURIComponent(id)}/dispute`, { version, reason }) }
}

/** PostgreSQL numeric llega como string. NULL es dato ausente, nunca cero. */
export function numberOf(value: unknown): number {
  if (value === null || value === undefined || value === '') return Number.NaN
  const n = Number(value)
  if (!Number.isFinite(n)) throw new ApiError(502, 'La API devolvió un valor numérico inválido.')
  return n
}
export function groupKpi(data: KpisDto, basis = 'CONSOLIDADO'): KpiDto {
  const value = data.group.find(row => row.basisCode === basis)
  if (!value) throw new ApiError(404, `No hay indicadores con base ${basis} para esta corrida.`)
  return value
}
