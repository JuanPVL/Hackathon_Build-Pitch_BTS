import type { CompanyCode } from '@/entities'
import type { BalanceMatrix, MatrixCell, MatrixView } from './types'

export type CellStatus = MatrixCell['status']
export type StatusTone = 'ok' | 'info' | 'err' | 'neutral'

export const VIEW_OPTIONS: { value: MatrixView; label: string }[] = [
  { value: 'saldo', label: 'Saldos al cierre' },
  { value: 'facturado', label: 'Facturado' },
  { value: 'recibido', label: 'Recibido' },
]

export function parseView(raw: string | null): MatrixView {
  return VIEW_OPTIONS.some(o => o.value === raw) ? (raw as MatrixView) : 'saldo'
}

const MATRIX_TITLES: Record<MatrixView, string> = {
  saldo: 'Saldos IC al cierre · USD',
  facturado: 'Facturado entre empresas · USD',
  recibido: 'Recibido entre empresas · USD',
}
export function matrixTitle(view: MatrixView): string {
  return MATRIX_TITLES[view]
}

/** Estados de una celda: texto corto (matriz) y largo (lista móvil) más el tono del punto. */
const STATUS: Record<CellStatus, { short: string; long: string; tone: StatusTone }> = {
  EXACTO: { short: 'exacto', long: 'Exacto', tone: 'ok' },
  FX: { short: 'FX', long: 'Conciliado FX', tone: 'info' },
  DIFERENCIA: { short: 'dif.', long: 'Con diferencia', tone: 'err' },
  SIN_SALDO: { short: 'sin saldo', long: 'Sin saldo', tone: 'neutral' },
}
export function statusInfo(status: CellStatus) {
  return STATUS[status]
}

/** Celda de (empresa que reporta, contraparte); si no viene en la respuesta equivale a "sin saldo". */
export function findCell(matrix: BalanceMatrix, company: CompanyCode, counterparty: CompanyCode): MatrixCell {
  return matrix.cells.find(c => c.company === company && c.counterparty === counterparty)
    ?? { company, counterparty, balanceUsd: 0, status: 'SIN_SALDO' }
}

/** Una celda se puede abrir si no es la diagonal y tiene movimiento. */
export function isSelectable(cell: MatrixCell): boolean {
  return cell.company !== cell.counterparty && cell.status !== 'SIN_SALDO'
}

export interface AntisymmetryOptions { absUsd?: number; pct?: number }
export interface AntisymmetryViolation { a: CompanyCode; b: CompanyCode; sumUsd: number }

/**
 * Verifica que el saldo de A con B sea el espejo (signo contrario) del de B con A.
 * Se admite la diferencia cambiaria: |A + B| <= max(absUsd, pct × mayor magnitud).
 * Solo aplica a la vista de saldos; en facturado/recibido las filas no son espejo entre sí.
 */
export function antisymmetryViolations(matrix: BalanceMatrix, { absUsd = 50, pct = 0.02 }: AntisymmetryOptions = {}): AntisymmetryViolation[] {
  if (matrix.view !== 'saldo') return []
  const out: AntisymmetryViolation[] = []
  const { companies } = matrix
  for (let i = 0; i < companies.length; i++) {
    for (let j = i + 1; j < companies.length; j++) {
      const a = companies[i], b = companies[j]
      const x = findCell(matrix, a, b).balanceUsd
      const y = findCell(matrix, b, a).balanceUsd
      const sum = x + y
      const limit = Math.max(absUsd, pct * Math.max(Math.abs(x), Math.abs(y)))
      if (Math.abs(sum) > limit) out.push({ a, b, sumUsd: sum })
    }
  }
  return out
}

export function isAntisymmetric(matrix: BalanceMatrix, options?: AntisymmetryOptions): boolean {
  return antisymmetryViolations(matrix, options).length === 0
}

/** Socios con movimiento de una empresa, de mayor a menor saldo en valor absoluto. */
export function partnersOf(matrix: BalanceMatrix, company: CompanyCode): MatrixCell[] {
  return matrix.companies
    .filter(code => code !== company)
    .map(code => findCell(matrix, company, code))
    .filter(isSelectable)
    .sort((x, y) => Math.abs(y.balanceUsd) - Math.abs(x.balanceUsd))
}

export interface CompanySummary {
  /** Suma con signo de todos los socios. */
  netUsd: number
  /** Lo que le deben (suma de saldos positivos). */
  receivableUsd: number
  /** Lo que debe (suma de saldos negativos, en positivo). */
  payableUsd: number
  partners: number
}

/** Saldo neto de una empresa frente al resto del grupo. */
export function companySummary(matrix: BalanceMatrix, company: CompanyCode): CompanySummary {
  const partners = partnersOf(matrix, company)
  const receivableUsd = partners.filter(p => p.balanceUsd > 0).reduce((s, p) => s + p.balanceUsd, 0)
  const payableUsd = partners.filter(p => p.balanceUsd < 0).reduce((s, p) => s - p.balanceUsd, 0)
  return { netUsd: receivableUsd - payableUsd, receivableUsd, payableUsd, partners: partners.length }
}
