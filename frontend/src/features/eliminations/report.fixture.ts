import type { EliminationReport } from './domain/types'

/** Datos de prueba basados en el mockup 12 (V2). Solo para pruebas. */
export function buildReport(overrides: Partial<EliminationReport> = {}): EliminationReport {
  return {
    runId: 'C-2027-V2-003',
    summary: { pnl: 1_533_540, balance: 2_127_795, pending: 0, ebitEffect: 328, icIncome: 1_373_540, icExpense: 1_373_868, pairs: 131 },
    entries: [
      { rule: 'E1', concept: 'Ventas intercompany', accounts: '4200 ↔ 5200', issuerAmount: 977_540, receiverAmount: 976_943, difference: 597, targetAccount: '7900' },
      { rule: 'E1', concept: 'Servicios de gestión', accounts: '4300 ↔ 6200', issuerAmount: 396_000, receiverAmount: 396_925, difference: -925, targetAccount: '7900' },
      { rule: 'E4', concept: 'Intereses del préstamo', accounts: '7300 ↔ 7200', issuerAmount: 160_000, receiverAmount: 161_711, difference: -1_711, targetAccount: '7900' },
      { rule: 'E2', concept: 'Saldos CxC ↔ CxP', accounts: '1250 ↔ 2150', issuerAmount: 127_795, receiverAmount: 127_965, difference: -170, targetAccount: '3900' },
      { rule: 'E3', concept: 'Préstamo US2 → MX1', accounts: '1600 ↔ 2250', issuerAmount: 2_000_000, receiverAmount: 2_021_391, difference: -21_391, targetAccount: '3900' },
    ],
    fxIsolated: { pnl: -2_039, cta: -21_561 },
    capital: { employedBefore: 20_220_000, icRemoved: 2_000_000, employedAfter: 18_220_000, roceBefore: 0.1191, roceAfter: 0.1322 },
    ...overrides,
  }
}
