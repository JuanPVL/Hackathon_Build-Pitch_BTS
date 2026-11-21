import type { ValidationReport } from './domain/types'

/** Datos de prueba basados en el mockup 02 (escenario V1). Solo para pruebas. */
export function buildReport(overrides: Partial<ValidationReport> = {}): ValidationReport {
  const extra = Array.from({ length: 10 }, (_, i) => ({
    id: `X${i}`, rule: `V${20 + i}`, severity: 'A' as const, scope: 'GT2', record: `presupuesto_GT2_V1.csv#fila${i}`,
    message: `Hallazgo menor ${i}`, impactUsd: 1_000 - i,
  }))
  return {
    publishable: false,
    loads: [
      { owner: 'GT1', currency: 'GTQ', budget: 'CUARENTENA', balance: 'CUARENTENA', findings: 4 },
      { owner: 'MX1', currency: 'MXN', budget: 'CUARENTENA', balance: 'APROBADA', findings: 3 },
      { owner: 'TASAS', currency: 'GRUPO', budget: 'CUARENTENA', balance: null, findings: 1 },
    ],
    totals: { blocking: 18, warnings: 2, info: 0 },
    findings: [
      {
        id: 'F-V08', rule: 'V08', severity: 'B', scope: 'MXN', record: 'tasas_grupo_V1 · 2027-05 · PRESUPUESTO',
        message: 'Tasa MXN de presupuesto 2027-05 invertida: 18.0 en vez de ≈ 0.0556',
        found: '18.0000', expected: '≈ 0.0556', suggestion: 'usar 1 / 18.0 = 0.0556. La corrección queda auditada con autor y motivo.',
        impactUsd: 285_964_670,
      },
      { id: 'F-V09', rule: 'V09', severity: 'B', scope: 'US1', record: 'presupuesto_US1_V1.csv#fila46', message: 'Gastos operativos 2027-07 son 1,000× la mediana', impactUsd: 59_940_000 },
      { id: 'F-V02', rule: 'V02', severity: 'B', scope: 'MX1', record: 'presupuesto_MX1_V1.csv#fila13', message: 'Moneda declarada USD ≠ moneda funcional MXN', impactUsd: 850_000 },
      { id: 'F-V14', rule: 'V14', severity: 'A', scope: 'US2→MX2', record: 'politica TP-MGMT', message: 'Fee de gestión = 8.0 % de ventas de MX2', impactUsd: 54_000 },
      ...extra,
    ],
    ...overrides,
  }
}
