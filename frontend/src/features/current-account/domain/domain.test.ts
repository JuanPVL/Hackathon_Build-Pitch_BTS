import { describe, expect, it } from 'vitest'
import { saldoMatrix, gt1Mx1Pair } from '../current-account.fixtures'
import { antisymmetryViolations, companySummary, findCell, isAntisymmetric, isSelectable, parseView, partnersOf, statusInfo } from './matrix'
import { documentPath, formatPairParam, pairMirror, parsePairParam, samePair } from './pair'
import { companyName, isCompanyCode } from './companies'
import type { BalanceMatrix } from './types'

describe('companies', () => {
  it('resuelve el nombre por código', () => {
    expect(companyName('GT1')).toBe('Alfa Guatemala')
    expect(companyName('XX9')).toBe('XX9')
    expect(isCompanyCode('MX2')).toBe(true)
    expect(isCompanyCode('mx2')).toBe(false)
  })
})

describe('matriz', () => {
  it('parsea la vista y cae en saldos por defecto', () => {
    expect(parseView('facturado')).toBe('facturado')
    expect(parseView('x')).toBe('saldo')
    expect(parseView(null)).toBe('saldo')
  })

  it('busca celdas y trata las ausentes como sin saldo', () => {
    expect(findCell(saldoMatrix, 'GT1', 'MX1').balanceUsd).toBe(8333)
    const missing = findCell(saldoMatrix, 'GT1', 'US1')
    expect(missing.status).toBe('SIN_SALDO')
    expect(isSelectable(missing)).toBe(false)
    expect(isSelectable({ company: 'GT1', counterparty: 'GT1', balanceUsd: 1, status: 'EXACTO' })).toBe(false)
    expect(isSelectable(findCell(saldoMatrix, 'GT1', 'MX1'))).toBe(true)
  })

  it('describe cada estado con texto', () => {
    expect(statusInfo('EXACTO').short).toBe('exacto')
    expect(statusInfo('FX').long).toBe('Conciliado FX')
    expect(statusInfo('DIFERENCIA').tone).toBe('err')
  })

  it('verifica la antisimetría con tolerancia (diferencias FX aceptadas)', () => {
    expect(isAntisymmetric(saldoMatrix)).toBe(true)
    expect(antisymmetryViolations(saldoMatrix)).toEqual([])
  })

  it('detecta pares que no son espejo', () => {
    const broken: BalanceMatrix = { ...saldoMatrix, cells: saldoMatrix.cells.map(c => c.company === 'GT1' && c.counterparty === 'GT2' ? { ...c, balanceUsd: -9000 } : c) }
    const v = antisymmetryViolations(broken)
    expect(v).toHaveLength(1)
    expect(v[0]).toMatchObject({ a: 'GT1', b: 'GT2', sumUsd: -4000 })
  })

  it('exige espejo también cuando falta una de las dos celdas', () => {
    const half: BalanceMatrix = { ...saldoMatrix, cells: saldoMatrix.cells.filter(c => !(c.company === 'GT2' && c.counterparty === 'GT1')) }
    expect(antisymmetryViolations(half).map(v => `${v.a}-${v.b}`)).toEqual(['GT1-GT2'])
  })

  it('no aplica antisimetría a facturado/recibido', () => {
    expect(antisymmetryViolations({ ...saldoMatrix, view: 'facturado' })).toEqual([])
  })

  it('calcula el saldo neto y ordena socios por magnitud', () => {
    const summary = companySummary(saldoMatrix, 'GT1')
    expect(summary).toEqual({ netUsd: -4119, receivableUsd: 8333, payableUsd: 12452, partners: 3 })
    expect(partnersOf(saldoMatrix, 'GT1').map(p => p.counterparty)).toEqual(['MX1', 'US2', 'GT2'])
    expect(partnersOf(saldoMatrix, 'MX2').map(p => p.counterparty)).toEqual(['MX1', 'US2'])
  })

  it('una empresa sin movimientos tiene resumen en cero', () => {
    const empty: BalanceMatrix = { ...saldoMatrix, cells: [] }
    expect(companySummary(empty, 'GT1')).toEqual({ netUsd: 0, receivableUsd: 0, payableUsd: 0, partners: 0 })
  })
})

describe('par', () => {
  it('parsea y formatea el parámetro par', () => {
    expect(parsePairParam('GT1-MX1')).toEqual({ company: 'GT1', counterparty: 'MX1' })
    expect(parsePairParam('GT1-GT1')).toBeNull()
    expect(parsePairParam('GT1-ZZ9')).toBeNull()
    expect(parsePairParam('GT1')).toBeNull()
    expect(parsePairParam('GT1-MX1-US1')).toBeNull()
    expect(parsePairParam(null)).toBeNull()
    expect(formatPairParam({ company: 'US2', counterparty: 'GT2' })).toBe('US2-GT2')
    expect(samePair({ company: 'GT1', counterparty: 'MX1' }, { company: 'GT1', counterparty: 'MX1' })).toBe(true)
    expect(samePair(null, null)).toBe(false)
  })

  it('arma las patas: el saldo positivo es el acreedor', () => {
    const m = pairMirror(gt1Mx1Pair)
    expect(m).toMatchObject({ creditor: 'GT1', debtor: 'MX1', creditorUsd: 8333, debtorUsd: 8412, firstDocumentAmount: 'GTQ 65,000' })
    expect(m.firstDocument?.key).toBe('IC-F1-2027-01')
  })

  it('invierte las patas cuando la empresa consultada debe', () => {
    const m = pairMirror({ ...gt1Mx1Pair, company: 'MX1', counterparty: 'GT1', balanceUsd: -8412, mirrorBalanceUsd: 8333 })
    expect(m).toMatchObject({ creditor: 'GT1', debtor: 'MX1', creditorUsd: 8333, debtorUsd: 8412 })
  })

  it('un par sin documentos no tiene primer documento', () => {
    const m = pairMirror({ ...gt1Mx1Pair, documents: [] })
    expect(m.firstDocument).toBeUndefined()
    expect(m.firstDocumentAmount).toBeUndefined()
  })

  it('arma la ruta del documento', () => {
    expect(documentPath('IC-F1-2027-12')).toBe('/documentos/IC-F1-2027-12')
  })
})
