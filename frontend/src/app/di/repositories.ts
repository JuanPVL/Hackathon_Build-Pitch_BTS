import type { HttpClient } from '@/shared/api/httpClient'
import { HttpConsolidationRepository, type ConsolidationRepository } from '@/features/consolidation'
import { HttpValidationRepository, type ValidationRepository } from '@/features/validation'
import { HttpReconciliationRepository, type ReconciliationRepository } from '@/features/reconciliation'
import { HttpCurrentAccountRepository, type CurrentAccountRepository } from '@/features/current-account'
import { HttpIcDocumentRepository, type IcDocumentRepository } from '@/features/ic-document'
import { HttpRatesRepository, type RatesRepository } from '@/features/rates'
import { HttpEliminationRepository, type EliminationRepository } from '@/features/eliminations'
import { HttpProfitabilityRepository, type ProfitabilityRepository } from '@/features/profitability'
import { HttpVarianceRepository, type VarianceRepository } from '@/features/variance'

/** Un puerto por módulo (segregación de interfaces). */
export interface Repositories {
  consolidation: ConsolidationRepository
  validation: ValidationRepository
  reconciliation: ReconciliationRepository
  currentAccount: CurrentAccountRepository
  icDocument: IcDocumentRepository
  rates: RatesRepository
  eliminations: EliminationRepository
  profitability: ProfitabilityRepository
  variance: VarianceRepository
}

/** Raíz de composición: el único lugar que decide qué implementación usa cada módulo. */
export function createHttpRepositories(http: HttpClient): Repositories {
  return {
    consolidation: new HttpConsolidationRepository(http),
    validation: new HttpValidationRepository(http),
    reconciliation: new HttpReconciliationRepository(http),
    currentAccount: new HttpCurrentAccountRepository(http),
    icDocument: new HttpIcDocumentRepository(http),
    rates: new HttpRatesRepository(http),
    eliminations: new HttpEliminationRepository(http),
    profitability: new HttpProfitabilityRepository(http),
    variance: new HttpVarianceRepository(http),
  }
}
