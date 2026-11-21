import type { EliminationEntry, EliminationReport } from './types'

export type EliminationView = 'antes' | 'despues'

/** Lee el parámetro `vista` de la URL; cualquier otro valor cae en "después" (el resultado correcto). */
export function parseView(raw: string | null): EliminationView {
  return raw === 'antes' ? 'antes' : 'despues'
}

/** Cuentas que reciben la diferencia: 7900 resultados, 3900 ajuste por conversión (CTA). */
export const PNL_ACCOUNT = '7900'
export const CTA_ACCOUNT = '3900'

export function targetAccountLabel(account: string): string {
  if (account === PNL_ACCOUNT) return 'resultados'
  if (account === CTA_ACCOUNT) return 'CTA'
  return account
}

/** La diferencia de un asiento es pata emisora − pata receptora. */
export function expectedDifference(entry: Pick<EliminationEntry, 'issuerAmount' | 'receiverAmount'>): number {
  return entry.issuerAmount - entry.receiverAmount
}

export function differenceMatches(entry: EliminationEntry, tolerance = 1): boolean {
  return Math.abs(expectedDifference(entry) - entry.difference) <= tolerance
}

/** Suma de las diferencias por cuenta destino. */
export function sumDifferences(entries: readonly EliminationEntry[]): { pnl: number; cta: number; other: number } {
  const total = { pnl: 0, cta: 0, other: 0 }
  for (const e of entries) {
    if (e.targetAccount === PNL_ACCOUNT) total.pnl += e.difference
    else if (e.targetAccount === CTA_ACCOUNT) total.cta += e.difference
    else total.other += e.difference
  }
  return total
}

export interface FxCheck { pnl: boolean; cta: boolean; entries: boolean; ok: boolean }

/** Verifica que las diferencias de los asientos cuadren con lo aislado (`fxIsolated`) y con emisora − receptora. */
export function verifyFxIsolated(entries: readonly EliminationEntry[], fxIsolated: EliminationReport['fxIsolated'], tolerance = 1): FxCheck {
  const sums = sumDifferences(entries)
  const pnl = Math.abs(sums.pnl - fxIsolated.pnl) <= tolerance
  const cta = Math.abs(sums.cta - fxIsolated.cta) <= tolerance
  const rows = entries.every(e => differenceMatches(e, tolerance)) && sums.other === 0
  return { pnl, cta, entries: rows, ok: pnl && cta && rows }
}

/** Suma de patas: lo que el grupo contaría si no eliminara. */
export function totalLegs(entries: readonly EliminationEntry[]): { issuer: number; receiver: number; total: number } {
  const issuer = entries.reduce((acc, e) => acc + e.issuerAmount, 0)
  const receiver = entries.reduce((acc, e) => acc + e.receiverAmount, 0)
  return { issuer, receiver, total: issuer + receiver }
}

/** Diferencia de ROCE (después − antes) en puntos porcentuales. */
export function roceGapPoints(capital: Pick<EliminationReport['capital'], 'roceBefore' | 'roceAfter'>): number {
  return (capital.roceAfter - capital.roceBefore) * 100
}

/** Capital sin eliminar − intercompany = capital del grupo. */
export function capitalBalances(capital: EliminationReport['capital'], tolerance = 1): boolean {
  return Math.abs(capital.employedBefore - capital.icRemoved - capital.employedAfter) <= tolerance
}

export function entryKey(e: EliminationEntry): string {
  return `${e.rule}|${e.accounts}|${e.concept}`
}
