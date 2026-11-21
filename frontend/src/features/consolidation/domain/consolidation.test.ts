import { describe, expect, it } from 'vitest'
import {
  eliminationNote, formatKpiDifference, formatKpiValue, kpiDifference, maxAbs, salesEquationHolds,
  sortEvaDesc, toPipelineSteps, uneliminatedSalesRatio,
} from './consolidation'
import { formatRunDate } from './runInfo'
import type { AccountLine, KpiValue } from './types'

const sales = { aggregate: 13935093, eliminations: 977540, consolidated: 12957553, icDocuments: 131 }
const line = (p: Partial<AccountLine>): AccountLine => ({ account: '4100', name: 'x', aggregate: 0, elimination: 0, consolidated: 0, isIntercompany: false, ...p })

describe('consolidation domain', () => {
  it('ordena los pasos del cierre y los numera', () => {
    const steps = toPipelineSteps([
      { code: 'EXPLICAR', closed: false, caption: 'e' },
      { code: 'VALIDAR', closed: true, caption: 'v' },
    ])
    expect(steps.map(s => s.title)).toEqual(['1. Validar', '5. Explicar'])
    expect(steps[0].closed).toBe(true)
  })

  it('calcula cuánto inflaría no eliminar el IC', () => {
    expect(uneliminatedSalesRatio(sales)).toBeCloseTo(0.0754, 3)
    expect(uneliminatedSalesRatio({ ...sales, consolidated: 0 })).toBe(0)
  })

  it('verifica Agregado − Eliminaciones = Consolidado', () => {
    expect(salesEquationHolds(sales)).toBe(true)
    expect(salesEquationHolds({ ...sales, consolidated: 12957000 })).toBe(false)
  })

  it('formatea KPIs y diferencias según la unidad', () => {
    const roic: KpiValue = { code: 'ROIC', value: 0.1195, unit: 'RATIO', withoutElimination: 0.1195, formula: '' }
    const roce: KpiValue = { code: 'ROCE', value: 0.1322, unit: 'RATIO', withoutElimination: 0.1191, formula: '' }
    const eva: KpiValue = { code: 'EVA', value: 142157, unit: 'USD', withoutElimination: 141933, formula: '' }
    expect(formatKpiValue(roic)).toBe('11.95 %')
    expect(formatKpiDifference(roic)).toBe('±0.00 pp')
    expect(formatKpiDifference(roce)).toBe('+1.31 pp')
    expect(kpiDifference(eva)).toBe(224)
    expect(formatKpiDifference(eva)).toBe('+224')
  })

  it('maxAbs ignora el signo y soporta lista vacía', () => {
    expect(maxAbs([376020, -426308, 1343])).toBe(426308)
    expect(maxAbs([])).toBe(0)
  })

  it('ordena EVA de mayor a menor sin mutar', () => {
    const input = [{ eva: -5 }, { eva: 10 }, { eva: 3 }]
    expect(sortEvaDesc(input).map(r => r.eva)).toEqual([10, 3, -5])
    expect(input[0].eva).toBe(-5)
  })

  it('describe la eliminación de una línea', () => {
    expect(eliminationNote(line({ isIntercompany: true, elimination: -977540 }))).toBe('eliminada −977,540')
    expect(eliminationNote(line({ elimination: 2039 }))).toBe('ajuste +2,039')
    expect(eliminationNote(line({}))).toBeNull()
  })

  it('formatea la fecha de la corrida y tolera fechas inválidas', () => {
    expect(formatRunDate('no-es-fecha')).toBe('—')
    expect(formatRunDate('2026-11-21T10:42:00')).toMatch(/2026/)
  })
})
