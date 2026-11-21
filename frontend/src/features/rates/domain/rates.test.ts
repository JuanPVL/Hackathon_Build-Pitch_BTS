import { describe, expect, it } from 'vitest'
import type { RateAlert } from './types'
import { alertTone, currencyDescription, formatVariation, rateTypeLabel, rateVariation, sortAlerts, statusLabel, usdPerUnit, variationDirection } from './rates'

describe('usdPerUnit', () => {
  it('invierte unidades por USD', () => {
    expect(usdPerUnit(7.8)).toBeCloseTo(0.128205, 6)
    expect(usdPerUnit(18.7)).toBeCloseTo(0.053476, 6)
    expect(usdPerUnit(1)).toBe(1)
  })
  it('tasa inválida → 0', () => {
    expect(usdPerUnit(0)).toBe(0)
    expect(usdPerUnit(-3)).toBe(0)
  })
})

describe('rateVariation', () => {
  it('MXN 18.00 → 18.70 = +3.9 %', () => {
    const v = rateVariation({ budgetPrevious: 18, budget: 18.7 })
    expect(v).toBeCloseTo(0.0389, 4)
    expect(formatVariation(v!)).toBe('+3.9 %')
    expect(variationDirection(v!)).toBe('up')
  })
  it('baja → signo menos tipográfico', () => {
    const v = rateVariation({ budgetPrevious: 20, budget: 19.6 })!
    expect(formatVariation(v)).toBe('−2.0 %')
    expect(variationDirection(v)).toBe('down')
  })
  it('sin anterior o sin cambio → null', () => {
    expect(rateVariation({ budgetPrevious: null, budget: 7.8 })).toBeNull()
    expect(rateVariation({ budgetPrevious: 7.8, budget: 7.8 })).toBeNull()
    expect(rateVariation({ budgetPrevious: 0, budget: 7.8 })).toBeNull()
  })
})

describe('etiquetas y alertas', () => {
  const alerts: RateAlert[] = [
    { severity: 'INFO', title: 'V1 → V2', detail: 'd1' },
    { severity: 'BLOQUEANTE', title: 'Tasa invertida', detail: 'd2', rule: 'V08' },
    { severity: 'INFO', title: 'Otra', detail: 'd3' },
  ]
  it('ordena bloqueantes primero y conserva el orden', () => {
    expect(sortAlerts(alerts).map(a => a.title)).toEqual(['Tasa invertida', 'V1 → V2', 'Otra'])
    expect(alerts[0].title).toBe('V1 → V2')
  })
  it('tono de alerta', () => {
    expect(alertTone(alerts[1])).toBe('err')
    expect(alertTone(alerts[0])).toBe('info')
  })
  it('tipo de tasa y estado', () => {
    expect(rateTypeLabel('HISTORICA')).toBe('HISTÓRICA')
    expect(rateTypeLabel('CIERRE')).toBe('CIERRE')
    expect(statusLabel('VIGENTE')).toBe('Vigente')
    expect(statusLabel('BORRADOR')).toBe('Borrador')
  })
  it('descripción de la moneda', () => {
    expect(currencyDescription({ name: 'Quetzal', companies: ['GT1', 'GT2'] })).toBe('Quetzal · GT1, GT2')
    expect(currencyDescription({ name: 'Dólar', companies: [] })).toBe('Dólar')
  })
})
