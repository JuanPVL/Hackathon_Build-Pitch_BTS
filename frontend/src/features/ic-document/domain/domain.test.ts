import { describe, expect, it } from 'vitest'
import { documentF1_12 } from '../ic-document.fixtures'
import { breadcrumbs, documentTitle, eventDate, legView, lineageHeading, lineageSumLabel, originLabel, pairPath, resultSummary } from './document'
import { currentStep, lifecycleSteps, stepState } from './lifecycle'

describe('documento', () => {
  it('arma el título con llave, tipo y ruta', () => {
    expect(documentTitle(documentF1_12)).toBe('IC-F1-2027-12 · Venta GT1 → MX1')
    expect(documentTitle({ ...documentF1_12, key: 'IC-F6-2027-01', type: 'INTERES', issuer: 'US2' })).toBe('IC-F6-2027-01 · Intereses US2 → MX1')
  })

  it('resume el resultado para la cabecera', () => {
    expect(resultSummary('CONCILIADO_FX')).toBe('Diferencia cambiaria · conciliado')
    expect(resultSummary('CONCILIADO')).toBe('Conciliado')
    expect(resultSummary('SIN_CONTRAPARTE')).toBe('Sin contraparte')
  })

  it('arma migas y ruta de vuelta al par', () => {
    expect(pairPath(documentF1_12)).toBe('/cuenta-corriente?par=GT1-MX1')
    expect(breadcrumbs(documentF1_12)).toEqual([
      { label: 'Cuenta corriente', to: '/cuenta-corriente' },
      { label: 'GT1 con MX1', to: '/cuenta-corriente?par=GT1-MX1' },
      { label: 'IC-F1-2027-12' },
    ])
  })

  it('presenta cada pata con monto pactado, USD y nota de conversión', () => {
    expect(legView(documentF1_12.receivable)).toEqual({
      label: 'GT1 · EMITE LA FACTURA', title: 'Cuenta por cobrar', subtitle: 'Cliente: MX1, empresa del grupo',
      amount: 'GTQ 65,000', note: 'USD 8,333.33 · tasa del grupo 7.80 GTQ/USD',
    })
    const cxp = legView(documentF1_12.payable)
    expect(cxp.title).toBe('Cuenta por pagar espejo')
    expect(cxp.note).toBe('USD 8,411.77 · via MXN 157,300 · diferencia 78.43 a la cuenta 7900')
  })

  it('formatea el origen de una línea de carga', () => {
    expect(originLabel('balance_GT1_V2.csv#fila8')).toBe('BALANCE_GT1_V2.CSV · FILA 8')
    expect(originLabel('balance.csv')).toBe('BALANCE.CSV')
    expect(lineageHeading(documentF1_12.lineage[0])).toBe('Saldo GT1 con MX1')
    expect(lineageHeading(documentF1_12.lineage[2])).toBe('BALANCE_GT1_V2.CSV · FILA 8')
  })

  it('etiqueta la suma del linaje y las fechas de eventos', () => {
    expect(lineageSumLabel(true)).toBe('Σ aportes = cifra')
    expect(lineageSumLabel(false)).toBe('Σ aportes ≠ cifra')
    expect(eventDate('2027-01-15T10:30:00Z')).toBe('2027-01-15')
    expect(eventDate(undefined)).toBe('')
  })
})

describe('ciclo de vida', () => {
  it('deriva el estado de cada paso', () => {
    expect(stepState({ reached: true, current: false })).toBe('done')
    expect(stepState({ reached: true, current: true })).toBe('current')
    expect(stepState({ reached: false, current: false })).toBe('pending')
  })

  it('une cada paso con el evento del mismo nombre', () => {
    const steps = lifecycleSteps(documentF1_12.lifecycle, documentF1_12.events)
    expect(steps.map(s => s.state)).toEqual(['done', 'done', 'done', 'current', 'pending'])
    expect(steps[0]).toMatchObject({ label: 'Emitida', actor: 'Contador GT1' })
    expect(steps[1].actor).toBeUndefined()
    expect(steps[3].actor).toBe('QUADRA · regla N2')
  })

  it('encuentra el paso actual o el último alcanzado', () => {
    expect(currentStep(documentF1_12.lifecycle)?.label).toBe('Conciliada')
    const noCurrent = documentF1_12.lifecycle.map(s => ({ ...s, current: false }))
    expect(currentStep(noCurrent)?.label).toBe('Conciliada')
    expect(currentStep([])).toBeUndefined()
  })
})
