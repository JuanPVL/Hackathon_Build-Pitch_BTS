import { describe, expect, it } from 'vitest'
import { buildReport } from '../report.fixture'
import {
  capitalBalances, differenceMatches, entryKey, expectedDifference, parseView, roceGapPoints, sumDifferences, targetAccountLabel, totalLegs, verifyFxIsolated,
} from './eliminations'

const report = buildReport()

describe('parseView', () => {
  it('antes solo si se pide; todo lo demás es después', () => {
    expect(parseView('antes')).toBe('antes')
    expect(parseView('despues')).toBe('despues')
    expect(parseView(null)).toBe('despues')
    expect(parseView('x')).toBe('despues')
  })
})

describe('diferencias', () => {
  it('diferencia = emisora − receptora', () => {
    expect(expectedDifference({ issuerAmount: 977_540, receiverAmount: 976_943 })).toBe(597)
    expect(report.entries.every(e => differenceMatches(e))).toBe(true)
  })
  it('detecta una diferencia que no corresponde', () => {
    expect(differenceMatches({ ...report.entries[0], difference: 900 })).toBe(false)
  })
  it('suma por cuenta destino', () => {
    expect(sumDifferences(report.entries)).toEqual({ pnl: -2_039, cta: -21_561, other: 0 })
  })
  it('etiquetas de cuenta', () => {
    expect(targetAccountLabel('7900')).toBe('resultados')
    expect(targetAccountLabel('3900')).toBe('CTA')
    expect(targetAccountLabel('1234')).toBe('1234')
  })
})

describe('verifyFxIsolated', () => {
  it('cuadra con fxIsolated del mockup', () => {
    expect(verifyFxIsolated(report.entries, report.fxIsolated)).toEqual({ pnl: true, cta: true, entries: true, ok: true })
  })
  it('falla si la diferencia aislada no coincide', () => {
    const check = verifyFxIsolated(report.entries, { pnl: -2_039, cta: -20_000 })
    expect(check.cta).toBe(false)
    expect(check.ok).toBe(false)
  })
  it('falla si hay diferencia en una cuenta no prevista', () => {
    const entries = [...report.entries, { ...report.entries[0], targetAccount: '9999', issuerAmount: 10, receiverAmount: 0, difference: 10 }]
    expect(verifyFxIsolated(entries, report.fxIsolated).ok).toBe(false)
  })
})

describe('patas y capital', () => {
  it('suma de patas', () => {
    expect(totalLegs(report.entries)).toEqual({ issuer: 3_661_335, receiver: 3_684_935, total: 7_346_270 })
  })
  it('ROCE: +1.31 puntos', () => {
    expect(roceGapPoints(report.capital)).toBeCloseTo(1.31, 2)
  })
  it('capital: 20.22 M − 2.00 M = 18.22 M', () => {
    expect(capitalBalances(report.capital)).toBe(true)
    expect(capitalBalances({ ...report.capital, employedAfter: 19_000_000 })).toBe(false)
  })
  it('llave estable de asiento', () => {
    expect(entryKey(report.entries[0])).toBe('E1|4200 ↔ 5200|Ventas intercompany')
  })
})
