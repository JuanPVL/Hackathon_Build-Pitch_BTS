import type { VarianceBridge } from '../domain/types'

/** Cifras de referencia del mockup (V1 → V2) solo para pruebas. */
export const bridge: VarianceBridge = {
  metric: 'EBIT',
  from: { scenarioId: 'PPTO_V1', label: 'V1 corregida', value: 2360308 },
  to: { scenarioId: 'PPTO_V2', label: 'V2', value: 2408907 },
  effects: [
    { id: 'e1', code: 'VOLUMEN', label: 'Volumen', value: 300000, companies: ['MX1'] },
    { id: 'e2', code: 'COSTO', label: 'Costo de ventas', value: -120000, companies: ['MX1', 'GT1'] },
    { id: 'e3', code: 'PRECIO', label: 'Precio', value: -90000, companies: ['GT1'] },
    { id: 'e4', code: 'TIPO_CAMBIO', label: 'Tipo de cambio', value: -41401, companies: ['MX1', 'MX2'] },
  ],
  residual: 0,
  byCompany: [],
  eva: { from: 237139, to: 142157, effects: [{ label: 'Parámetro WACC', value: -149432 }, { label: 'Capital invertido', value: 20462 }] },
  narrative: null,
}
