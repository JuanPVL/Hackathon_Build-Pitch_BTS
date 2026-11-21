import { describe, expect, it } from 'vitest'
import {
  allFiguresVerified, barGeometry, bridgeDelta, bridgeDeltaRatio, buildWaterfall, directionOf, effectsSumToDelta,
  evaDelta, formatResidual, isResidualExact, largestEffect, maxEffect, metricTitle, parseRequest, sumEffects,
  topCompanyEffects, waterfallScale,
} from './bridge'
import type { VarianceBridge } from './types'
import { bridge } from '../testing/bridgeFixture'

const ids = ['PPTO_V1', 'PPTO_V2']

describe('variance domain', () => {
  it('calcula la diferencia y su proporción', () => {
    expect(bridgeDelta(bridge)).toBe(48599)
    expect(bridgeDeltaRatio(bridge)).toBeCloseTo(0.0206, 3)
    expect(bridgeDeltaRatio({ from: { ...bridge.from, value: 0 }, to: bridge.to })).toBeNull()
  })

  it('verifica que los efectos suman la diferencia', () => {
    expect(sumEffects(bridge.effects)).toBe(48599)
    expect(effectsSumToDelta(bridge)).toBe(true)
    expect(effectsSumToDelta({ ...bridge, effects: bridge.effects.slice(1) })).toBe(false)
  })

  it('el residual es exacto bajo 0.5 y se formatea con dos decimales', () => {
    expect(isResidualExact(0.2)).toBe(true)
    expect(isResidualExact(-0.5)).toBe(false)
    expect(formatResidual(0)).toBe('0.00')
    expect(formatResidual(-1.5)).toBe('−1.50')
  })

  it('arma la cascada con base acumulada', () => {
    const steps = buildWaterfall(bridge)
    expect(steps).toHaveLength(6)
    expect(steps[1]).toMatchObject({ start: 2360308, end: 2660308, direction: 'up' })
    expect(steps[2]).toMatchObject({ start: 2660308, end: 2540308, direction: 'down' })
    expect(steps[4].end).toBe(2408907)
    expect(steps[5]).toMatchObject({ kind: 'total', value: 2408907 })
  })

  it('agrega un paso de residual solo cuando no es cero', () => {
    expect(buildWaterfall({ ...bridge, residual: 5 }).some(s => s.key === 'residual')).toBe(true)
    expect(buildWaterfall(bridge).some(s => s.key === 'residual')).toBe(false)
  })

  it('recorta el eje cuando los efectos son pequeños frente a los totales', () => {
    const scale = waterfallScale(buildWaterfall(bridge))
    expect(scale.truncated).toBe(true)
    expect(scale.floor).toBe(2300000)
    expect(scale.ceiling).toBe(2660308)
    const geo = barGeometry(buildWaterfall(bridge)[1], scale)
    expect(geo.bottomPct).toBeGreaterThan(0)
    expect(geo.heightPct).toBeCloseTo((300000 / 360308) * 100, 1)
  })

  it('no recorta el eje si los efectos son del tamaño de los totales', () => {
    const big: VarianceBridge = { ...bridge, from: { ...bridge.from, value: 100 }, to: { ...bridge.to, value: 150 }, effects: [{ id: 'a', code: 'VOLUMEN', label: 'a', value: 50, companies: [] }] }
    const scale = waterfallScale(buildWaterfall(big))
    expect(scale.truncated).toBe(false)
    expect(scale.floor).toBe(0)
  })

  it('ordena causas por empresa por magnitud y limita', () => {
    const rows = [
      { effect: 'VOLUMEN' as const, label: 'a', company: 'MX1' as const, value: 10 },
      { effect: 'COSTO' as const, label: 'b', company: 'GT1' as const, value: -50 },
      { effect: 'PRECIO' as const, label: 'c', company: 'US1' as const, value: 30 },
    ]
    expect(topCompanyEffects(rows, 2).map(r => r.label)).toEqual(['b', 'c'])
    expect(rows[0].label).toBe('a')
  })

  it('utilidades: máximo, dirección, mayor efecto y delta de EVA', () => {
    expect(maxEffect([300000, -120000])).toBe(300000)
    expect(directionOf(-1)).toBe('down')
    expect(directionOf(0)).toBe('flat')
    expect(largestEffect(bridge.eva.effects)?.label).toBe('Parámetro WACC')
    expect(largestEffect([])).toBeUndefined()
    expect(evaDelta(bridge.eva)).toBe(-94982)
  })

  it('valida los parámetros de la URL con valores por defecto', () => {
    expect(parseRequest({ from: null, to: null, metric: null }, ids)).toEqual({ from: 'PPTO_V1', to: 'PPTO_V2', metric: 'EBIT' })
    expect(parseRequest({ from: 'PPTO_V2', to: 'xx', metric: 'EVA' }, ids)).toEqual({ from: 'PPTO_V2', to: 'PPTO_V2', metric: 'EVA' })
    expect(parseRequest({ from: null, to: null, metric: 'raro' }, ids).metric).toBe('EBIT')
  })

  it('título según la métrica y verificación de cifras', () => {
    expect(metricTitle('EBIT')).toBe('¿Por qué cambió el EBIT?')
    expect(allFiguresVerified({ verifiedFigures: 9, totalFigures: 9 })).toBe(true)
    expect(allFiguresVerified({ verifiedFigures: 8, totalFigures: 9 })).toBe(false)
    expect(allFiguresVerified({ verifiedFigures: 0, totalFigures: 0 })).toBe(false)
  })
})
