/** Tipos del dominio compartidos por varios módulos. Montos en número; el formato vive en shared/format. */

export type CompanyCode = 'GT1' | 'GT2' | 'MX1' | 'MX2' | 'US1' | 'US2'
export type CurrencyCode = 'GTQ' | 'MXN' | 'USD'

export interface Company { code: CompanyCode; name: string; country: 'GT' | 'MX' | 'US'; currency: CurrencyCode }

export interface Money { currency: CurrencyCode; amount: number }

/** Llave de un documento intercompany, p. ej. `IC-F1-2027-12`. Es la llave de conciliación. */
export type IcDocumentKey = string

/** Escenario consultado. `scenarioId` corresponde a `scenario.scenarioId` en la base (PPTO_V1, PPTO_V2). */
export interface ScenarioQuery {
  scenarioId: string
  /** Moneda de presentación. Hoy siempre USD. */
  currency: CurrencyCode
}

export type LoadStatus = 'RECIBIDA' | 'CUARENTENA' | 'PENDIENTE_APROBACION' | 'VALIDADA' | 'APROBADA' | 'REEMPLAZADA'

export const COMPANIES: readonly Company[] = [
  { code: 'GT1', name: 'Alfa Guatemala', country: 'GT', currency: 'GTQ' },
  { code: 'GT2', name: 'Beta Guatemala', country: 'GT', currency: 'GTQ' },
  { code: 'MX1', name: 'Alfa México', country: 'MX', currency: 'MXN' },
  { code: 'MX2', name: 'Gamma México', country: 'MX', currency: 'MXN' },
  { code: 'US1', name: 'Alfa USA', country: 'US', currency: 'USD' },
  { code: 'US2', name: 'Delta Holding USA', country: 'US', currency: 'USD' },
]
