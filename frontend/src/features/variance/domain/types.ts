import type { CompanyCode } from '@/entities'

export type BridgeMetric = 'EBIT' | 'VENTAS' | 'EVA'
export type EffectCode = 'VOLUMEN' | 'PRECIO' | 'COSTO' | 'TIPO_CAMBIO' | 'PERIMETRO_IC' | 'CORRECCION_CARGA' | 'PARAMETRO' | 'RESIDUAL' | 'COSTO_VENTAS' | 'GASTO_OPERATIVO' | 'IC_NEUTRAL' | 'EBIT_DESPUES_IMPUESTOS' | 'TASA_IMPUESTO' | 'WACC' | 'CAPITAL_INVERTIDO'

export interface BridgeEffect { id: string; code: EffectCode; label: string; value: number; companies: CompanyCode[] }

export interface CompanyEffect { effect: EffectCode; label: string; company: CompanyCode; value: number }

/** Texto generado por IA a partir del bridge. La IA no calcula: solo redacta cifras verificadas. */
export interface Narrative { text: string; verifiedFigures: number; totalFigures: number; causes: { text: string; sourceId: string }[] }

/** Respuesta de GET /variance-bridge?from=&to=&metric= (propuesta). */
export interface VarianceBridge {
  bridgeId?: string
  balanced?: boolean
  metric: BridgeMetric
  from: { scenarioId: string; label: string; value: number }
  to: { scenarioId: string; label: string; value: number }
  effects: BridgeEffect[]
  residual: number
  byCompany: CompanyEffect[]
  eva: { from: number; to: number; effects: { label: string; value: number }[] }
  narrative: Narrative | null
}

export interface BridgeRequest { from: string; to: string; metric: BridgeMetric }
