import type { LoadStatus } from '@/entities'
import type { Finding, Severity } from './types'

/** Ordena por impacto en USD descendente (regla del validador). No muta la entrada; desempata por regla e id. */
export function sortFindingsByImpact(findings: readonly Finding[]): Finding[] {
  return [...findings].sort((a, b) => b.impactUsd - a.impactUsd || a.rule.localeCompare(b.rule) || a.id.localeCompare(b.id))
}

export interface SeverityCounts { blocking: number; warnings: number; info: number }

export function countBySeverity(findings: readonly Finding[]): SeverityCounts {
  const counts: SeverityCounts = { blocking: 0, warnings: 0, info: 0 }
  for (const f of findings) {
    if (f.severity === 'B') counts.blocking += 1
    else if (f.severity === 'A') counts.warnings += 1
    else counts.info += 1
  }
  return counts
}

export function severityLabel(severity: Severity): string {
  return { B: 'Bloqueante', A: 'Advertencia', I: 'Informativa' }[severity]
}

export type SeverityTone = 'err' | 'warn' | 'info'
export function severityTone(severity: Severity): SeverityTone {
  return ({ B: 'err', A: 'warn', I: 'info' } as const)[severity]
}

export function loadStatusLabel(status: LoadStatus | null): string {
  if (status === null) return 'Sin carga'
  return {
    RECIBIDA: 'Recibida',
    CUARENTENA: 'Cuarentena',
    PENDIENTE_APROBACION: 'Por aprobar',
    APROBADA: 'Aprobada',
    REEMPLAZADA: 'Reemplazada',
  }[status]
}

export type LoadStatusTone = 'ok' | 'err' | 'warn' | 'info' | 'neutral'
export function loadStatusTone(status: LoadStatus | null): LoadStatusTone {
  if (status === null) return 'neutral'
  return ({ RECIBIDA: 'info', CUARENTENA: 'err', PENDIENTE_APROBACION: 'warn', APROBADA: 'ok', REEMPLAZADA: 'neutral' } as const)[status]
}

/** Primeros `limit` elementos y cuántos quedan fuera. Con `expanded` se muestran todos. */
export function takeVisible<T>(items: readonly T[], limit: number, expanded: boolean): { visible: T[]; hidden: number } {
  if (expanded || items.length <= limit) return { visible: [...items], hidden: 0 }
  return { visible: items.slice(0, limit), hidden: items.length - limit }
}

export function pluralFindings(n: number): string {
  return n === 1 ? '1 hallazgo' : `${n} hallazgos`
}
