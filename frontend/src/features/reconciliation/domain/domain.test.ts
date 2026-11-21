import { describe, expect, it } from 'vitest'
import { agreedLabel, differenceLabel, orderedResultCounts, resultInfo, RESULT_ORDER, routeLabel, toleranceLabel } from './results'
import { filterToIcType, icTypeLabel, parseTypeFilter } from './filters'

describe('resultInfo', () => {
  it('define etiqueta, tono, descripción y acción para cada resultado', () => {
    for (const r of RESULT_ORDER) {
      const info = resultInfo(r)
      expect(info.result).toBe(r)
      expect(info.label).not.toBe('')
      expect(info.description).not.toBe('')
      expect(info.action).not.toBe('')
    }
  })
  it('usa tonos que no dependen solo del color para distinguir exactos y cambiarios', () => {
    expect(resultInfo('CONCILIADO').tone).toBe('ok')
    expect(resultInfo('CONCILIADO_FX').tone).toBe('info')
    expect(resultInfo('SIN_CONTRAPARTE').tone).toBe('err')
    expect(resultInfo('DIFERENCIA_CORTE').tone).toBe('warn')
    expect(resultInfo('CONCILIADO_FX').shortLabel).toBe('Dif. cambiaria')
    expect(resultInfo('CONCILIADO_FX').action).toBe('Concilia y lleva la diferencia a 7900')
  })
})

describe('orderedResultCounts', () => {
  it('devuelve los seis resultados en orden fijo con 0 para los ausentes', () => {
    const out = orderedResultCounts([{ result: 'CONCILIADO_FX', count: 92 }, { result: 'CONCILIADO', count: 39 }])
    expect(out.map(o => o.result)).toEqual([...RESULT_ORDER])
    expect(out.map(o => o.count)).toEqual([39, 92, 0, 0, 0, 0])
  })
})

describe('etiquetas de par', () => {
  it('formatea ruta, monto pactado y diferencia', () => {
    expect(routeLabel({ issuer: 'GT1', receiver: 'MX1' })).toBe('GT1 → MX1')
    expect(agreedLabel({ currency: 'GTQ', amount: 65000 })).toBe('GTQ 65,000')
    expect(differenceLabel(-78.4319)).toBe('−78.43')
    expect(differenceLabel(128.2)).toBe('+128.20')
    expect(differenceLabel(0)).toBe('0.00')
    expect(differenceLabel(0.001)).toBe('0.00')
  })
  it('interpreta la tolerancia como proporción o como porcentaje', () => {
    expect(toleranceLabel({ usd: 50, pct: 2 })).toBe('USD 50 o 2 %')
    expect(toleranceLabel({ usd: 50, pct: 0.02 })).toBe('USD 50 o 2 %')
    expect(toleranceLabel({ usd: 50, pct: 0.015 })).toBe('USD 50 o 1.50 %')
  })
})

describe('filtro por tipo', () => {
  it('traduce la URL al filtro y descarta valores desconocidos', () => {
    expect(parseTypeFilter('VENTA')).toBe('VENTA')
    expect(parseTypeFilter(null)).toBe('TODAS')
    expect(parseTypeFilter('otro')).toBe('TODAS')
    expect(filterToIcType('TODAS')).toBeUndefined()
    expect(filterToIcType('INTERES')).toBe('INTERES')
    expect(icTypeLabel('GESTION')).toBe('Gestión')
  })
})
