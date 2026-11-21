import type { CompanyCode } from '@/entities'
import type { BalanceMatrix, MatrixCell, PairDetail } from './domain/types'

/** Datos de prueba tomados del mockup 03 (saldos al cierre, V2). Solo para pruebas. */
const cell = (company: CompanyCode, counterparty: CompanyCode, balanceUsd: number, status: MatrixCell['status']): MatrixCell =>
  ({ company, counterparty, balanceUsd, status })

export const saldoMatrix: BalanceMatrix = {
  view: 'saldo',
  companies: ['GT1', 'GT2', 'MX1', 'MX2', 'US1', 'US2'],
  totals: { documents: 131, exact: 39, fx: 92, orphan: 0, disputed: 0 },
  cells: [
    cell('GT1', 'GT2', -5000, 'EXACTO'), cell('GT1', 'MX1', 8333, 'FX'), cell('GT1', 'US2', -7452, 'FX'),
    cell('GT2', 'GT1', 5000, 'EXACTO'), cell('GT2', 'US1', -19872, 'FX'), cell('GT2', 'US2', -2981, 'FX'),
    cell('MX1', 'GT1', -8412, 'FX'), cell('MX1', 'MX2', 48128, 'EXACTO'), cell('MX1', 'US2', -2043963, 'FX'),
    cell('MX2', 'MX1', -48128, 'EXACTO'), cell('MX2', 'US2', -4548, 'FX'),
    cell('US1', 'GT2', 20000, 'FX'), cell('US1', 'US2', -9000, 'EXACTO'),
    cell('US2', 'GT1', 7500, 'FX'), cell('US2', 'GT2', 3000, 'FX'), cell('US2', 'MX1', 2022333, 'FX'), cell('US2', 'MX2', 4500, 'FX'), cell('US2', 'US1', 9000, 'EXACTO'),
  ],
}

export const gt1Mx1Pair: PairDetail = {
  company: 'GT1',
  counterparty: 'MX1',
  description: 'Alfa Guatemala vende servicios a Alfa México: GTQ 65,000 al mes, facturado en la moneda de GT1.',
  balanceUsd: 8333,
  mirrorBalanceUsd: -8412,
  fxDifferenceUsd: -78.43,
  documents: Array.from({ length: 12 }, (_, i) => ({
    key: `IC-F1-2027-${String(i + 1).padStart(2, '0')}`,
    agreed: { currency: 'GTQ' as const, amount: 65000 },
    result: 'CONCILIADO_FX' as const,
  })),
}
