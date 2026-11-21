import { describe, expect, it } from 'vitest'
import type { Finding } from './types'
import { countBySeverity, loadStatusLabel, loadStatusTone, pluralFindings, severityLabel, severityTone, sortFindingsByImpact, takeVisible } from './validation'

const f = (id: string, rule: string, severity: Finding['severity'], impactUsd: number): Finding => ({
  id, rule, severity, scope: 'MXN', record: 'x.csv#fila1', message: `Hallazgo ${rule}`, impactUsd,
})

describe('sortFindingsByImpact', () => {
  it('ordena por impacto descendente sin mutar la entrada', () => {
    const input = [f('a', 'V02', 'B', 850_000), f('b', 'V08', 'B', 285_964_670), f('c', 'V14', 'A', 54_000)]
    const sorted = sortFindingsByImpact(input)
    expect(sorted.map(x => x.rule)).toEqual(['V08', 'V02', 'V14'])
    expect(input.map(x => x.rule)).toEqual(['V02', 'V08', 'V14'])
  })
  it('desempata por regla', () => {
    expect(sortFindingsByImpact([f('b', 'V09', 'B', 10), f('a', 'V02', 'B', 10)]).map(x => x.rule)).toEqual(['V02', 'V09'])
  })
})

describe('countBySeverity', () => {
  it('cuenta bloqueantes, advertencias e informativas', () => {
    expect(countBySeverity([f('1', 'V08', 'B', 1), f('2', 'V09', 'B', 1), f('3', 'V14', 'A', 1), f('4', 'V20', 'I', 1)])).toEqual({ blocking: 2, warnings: 1, info: 1 })
  })
  it('lista vacía → ceros', () => {
    expect(countBySeverity([])).toEqual({ blocking: 0, warnings: 0, info: 0 })
  })
})

describe('etiquetas', () => {
  it('severidad', () => {
    expect(severityLabel('B')).toBe('Bloqueante')
    expect(severityLabel('A')).toBe('Advertencia')
    expect(severityLabel('I')).toBe('Informativa')
    expect(severityTone('B')).toBe('err')
    expect(severityTone('A')).toBe('warn')
  })
  it('estado de carga', () => {
    expect(loadStatusLabel('CUARENTENA')).toBe('Cuarentena')
    expect(loadStatusLabel('APROBADA')).toBe('Aprobada')
    expect(loadStatusLabel(null)).toBe('Sin carga')
    expect(loadStatusTone('CUARENTENA')).toBe('err')
    expect(loadStatusTone('APROBADA')).toBe('ok')
    expect(loadStatusTone(null)).toBe('neutral')
  })
  it('plural de hallazgos', () => {
    expect(pluralFindings(1)).toBe('1 hallazgo')
    expect(pluralFindings(4)).toBe('4 hallazgos')
    expect(pluralFindings(0)).toBe('0 hallazgos')
  })
})

describe('takeVisible', () => {
  const items = Array.from({ length: 20 }, (_, i) => i)
  it('limita y reporta los restantes', () => {
    const { visible, hidden } = takeVisible(items, 10, false)
    expect(visible).toHaveLength(10)
    expect(hidden).toBe(10)
  })
  it('expandido muestra todo', () => {
    expect(takeVisible(items, 10, true)).toEqual({ visible: items, hidden: 0 })
  })
  it('menos que el límite no oculta nada', () => {
    expect(takeVisible([1, 2], 10, false).hidden).toBe(0)
  })
})
