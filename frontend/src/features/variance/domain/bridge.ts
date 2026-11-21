import type { BridgeEffect, BridgeMetric, BridgeRequest, CompanyEffect, Narrative, VarianceBridge } from './types'

import { formatAmount } from '@/shared/format/number'

export const RESIDUAL_TOLERANCE = 0.5
export const DEFAULT_REQUEST: BridgeRequest = { from: 'PPTO_V1', to: 'PPTO_V2', metric: 'EBIT' }
export const METRICS: BridgeMetric[] = ['EBIT', 'VENTAS', 'EVA']

/* ---------- Parámetros de la URL ---------- */

function pick<T extends string>(raw: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.find(a => a === raw) ?? fallback
}

/** Parámetros `desde`, `hasta`, `metrica` → solicitud válida con valores por defecto. */
export function parseRequest(params: { from: string | null; to: string | null; metric: string | null }, ids: readonly string[]): BridgeRequest {
  return {
    from: pick(params.from, ids, DEFAULT_REQUEST.from),
    to: pick(params.to, ids, DEFAULT_REQUEST.to),
    metric: pick(params.metric, METRICS, DEFAULT_REQUEST.metric),
  }
}

/** Título de la pantalla según la métrica explicada. */
export function metricTitle(metric: BridgeMetric): string {
  return { EBIT: '¿Por qué cambió el EBIT?', VENTAS: '¿Por qué cambiaron las ventas?', EVA: '¿Por qué cambió el EVA?' }[metric]
}

export function metricLabel(metric: BridgeMetric): string {
  return { EBIT: 'EBIT consolidado · USD', VENTAS: 'Ventas consolidadas · USD', EVA: 'EVA consolidado · USD' }[metric]
}

/* ---------- Reglas del puente ---------- */

export function bridgeDelta(bridge: Pick<VarianceBridge, 'from' | 'to'>): number {
  return bridge.to.value - bridge.from.value
}

/** Variación relativa respecto al valor inicial; null si el inicial es 0. */
export function bridgeDeltaRatio(bridge: Pick<VarianceBridge, 'from' | 'to'>): number | null {
  return bridge.from.value === 0 ? null : bridgeDelta(bridge) / Math.abs(bridge.from.value)
}

export function sumEffects(effects: { value: number }[]): number {
  return effects.reduce((acc, e) => acc + e.value, 0)
}

/** Los efectos (más el residual) suman exactamente la diferencia entre versiones. */
export function effectsSumToDelta(bridge: VarianceBridge, tolerance = RESIDUAL_TOLERANCE): boolean {
  return Math.abs(sumEffects(bridge.effects) + bridge.residual - bridgeDelta(bridge)) < tolerance
}

/** El residual es "cero" para efectos prácticos si su valor absoluto no llega a la tolerancia. */
export function isResidualExact(residual: number, tolerance = RESIDUAL_TOLERANCE): boolean {
  return Math.abs(residual) < tolerance
}

/** Residual con dos decimales siempre ("0.00" cuando es cero). */
export function formatResidual(residual: number): string {
  return Math.abs(residual) < 0.005 ? '0.00' : formatAmount(residual, 2)
}

export type Direction = 'up' | 'down' | 'flat'
export function directionOf(value: number): Direction {
  return value > 0 ? 'up' : value < 0 ? 'down' : 'flat'
}

/* ---------- Cascada ---------- */

export interface WaterfallStep {
  key: string
  label: string
  kind: 'total' | 'effect'
  /** Valor del total o del efecto. */
  value: number
  /** Base acumulada antes y después de este paso. */
  start: number
  end: number
  direction: Direction
}

/** Total inicial, efectos con base acumulada, residual si no es cero y total final. */
export function buildWaterfall(bridge: VarianceBridge): WaterfallStep[] {
  const steps: WaterfallStep[] = [{
    key: 'from', label: bridge.from.label, kind: 'total', value: bridge.from.value, start: 0, end: bridge.from.value, direction: 'flat',
  }]
  let running = bridge.from.value
  const effects: { key: string; label: string; value: number }[] = bridge.effects.map(e => ({ key: e.id, label: e.label, value: e.value }))
  if (!isResidualExact(bridge.residual)) effects.push({ key: 'residual', label: 'Residual', value: bridge.residual })
  for (const e of effects) {
    steps.push({ key: e.key, label: e.label, kind: 'effect', value: e.value, start: running, end: running + e.value, direction: directionOf(e.value) })
    running += e.value
  }
  steps.push({ key: 'to', label: bridge.to.label, kind: 'total', value: bridge.to.value, start: 0, end: bridge.to.value, direction: 'flat' })
  return steps
}

export interface WaterfallScale { floor: number; ceiling: number; truncated: boolean }

/**
 * Escala vertical. Si los totales son grandes frente al rango de los efectos, se recorta el eje
 * (la base no es 0) para que los efectos se vean; la interfaz avisa que el eje está recortado.
 */
export function waterfallScale(steps: WaterfallStep[]): WaterfallScale {
  const levels = steps.flatMap(s => (s.kind === 'effect' ? [s.start, s.end] : [s.value]))
  const lo = Math.min(...levels)
  const hi = Math.max(...levels)
  const effectLevels = steps.filter(s => s.kind === 'effect').flatMap(s => [s.start, s.end])
  const totals = steps.filter(s => s.kind === 'total').map(s => s.value)
  const effectRange = effectLevels.length ? Math.max(...effectLevels) - Math.min(...effectLevels) : 0
  const minTotal = Math.min(...totals)
  if (minTotal > 0 && effectRange > 0 && effectRange < minTotal * 0.5) {
    const padded = lo - effectRange * 0.15
    const magnitude = 10 ** Math.floor(Math.log10(Math.max(effectRange, 1)))
    const floor = Math.max(0, Math.floor(padded / magnitude) * magnitude)
    return { floor, ceiling: hi, truncated: floor > 0 }
  }
  return { floor: Math.min(0, lo), ceiling: Math.max(0, hi), truncated: false }
}

export interface BarGeometry { bottomPct: number; heightPct: number }

/** Posición y alto de la barra como porcentaje del eje (altura mínima visible de 1.5 %). */
export function barGeometry(step: WaterfallStep, scale: WaterfallScale): BarGeometry {
  const span = scale.ceiling - scale.floor
  if (span <= 0) return { bottomPct: 0, heightPct: 0 }
  const base = step.kind === 'total' ? Math.max(0, scale.floor) : Math.min(step.start, step.end)
  const top = step.kind === 'total' ? step.value : Math.max(step.start, step.end)
  const low = Math.min(base, top)
  const high = Math.max(base, top)
  return {
    bottomPct: ((low - scale.floor) / span) * 100,
    heightPct: Math.max(1.5, ((high - low) / span) * 100),
  }
}

/** Máximo valor absoluto entre los efectos, base de las barras de la lista móvil. */
export function maxEffect(values: number[]): number {
  return values.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
}

/* ---------- Causas por empresa ---------- */

/** Mayores causas por empresa según su magnitud, sin mutar la entrada. */
export function topCompanyEffects(rows: CompanyEffect[], limit = 6): CompanyEffect[] {
  return [...rows].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, limit)
}

/** El efecto de mayor magnitud (para resaltarlo en el puente del EVA). */
export function largestEffect<T extends { value: number }>(effects: T[]): T | undefined {
  return effects.reduce<T | undefined>((best, e) => (best === undefined || Math.abs(e.value) > Math.abs(best.value) ? e : best), undefined)
}

export function evaDelta(eva: VarianceBridge['eva']): number {
  return eva.to - eva.from
}

/* ---------- Narrativa ---------- */

export function allFiguresVerified(n: Pick<Narrative, 'verifiedFigures' | 'totalFigures'>): boolean {
  return n.totalFigures > 0 && n.verifiedFigures === n.totalFigures
}

export function effectCompaniesLabel(e: Pick<BridgeEffect, 'companies'>): string {
  return e.companies.join(' · ')
}
