import { describe, expect, it } from 'vitest'
import {
  countValueCreators, formatByUnit, formatComparisonValue, parseView, signedEva, sortByEva, verdictOf,
} from './profitability'
import type { CompanyProfitability } from './types'

const co = (company: CompanyProfitability['company'], eva: number): CompanyProfitability => ({ company, name: company, roic: 0, roce: 0, eva })

describe('profitability domain', () => {
  it('interpreta el parámetro vista con valor por defecto', () => {
    expect(parseView('sin-eliminar')).toBe('sin-eliminar')
    expect(parseView('consolidado')).toBe('consolidado')
    expect(parseView(null)).toBe('consolidado')
    expect(parseView('otra')).toBe('consolidado')
  })

  it('formatea por unidad', () => {
    expect(formatByUnit(0.1195, 'RATIO')).toBe('11.95 %')
    expect(formatByUnit(1785910, 'USD')).toBe('1,785,910')
    expect(formatComparisonValue(18223385, 'USD')).toBe('18.22 M')
    expect(formatComparisonValue(141933, 'USD')).toBe('141,933')
    expect(formatComparisonValue(-0.1919, 'RATIO')).toBe('−19.19 %')
  })

  it('una empresa crea valor solo con EVA positivo', () => {
    expect(verdictOf(1343)).toBe('crea')
    expect(verdictOf(0)).toBe('destruye')
    expect(verdictOf(-42671)).toBe('destruye')
  })

  it('ordena por EVA descendente sin mutar y cuenta las que crean valor', () => {
    const rows = [co('GT2', -42671), co('MX1', 376020), co('US2', 1343)]
    expect(sortByEva(rows).map(r => r.company)).toEqual(['MX1', 'US2', 'GT2'])
    expect(rows[0].company).toBe('GT2')
    expect(countValueCreators(rows)).toEqual({ creating: 2, total: 3 })
  })

  it('muestra el EVA con signo explícito', () => {
    expect(signedEva(376020)).toBe('+376,020')
    expect(signedEva(-426308)).toBe('−426,308')
  })
})
