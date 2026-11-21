import type { CompanyCode, IcDocumentKey, Money } from '@/entities'
import type { IcType, ReconciliationResult } from '@/entities/ic'

export type DocumentStatus = 'BORRADOR' | 'EMITIDA' | 'PENDIENTE_ACEPTACION' | 'ACEPTADA' | 'DISPUTADA' | 'CONCILIADA' | 'COMPENSADA' | 'ANULADA'

export interface DocumentLeg {
  company: CompanyCode
  role: 'CXC' | 'CXP'
  counterpartyLabel: string
  amount: Money
  usd: number
  /** Texto de conversión: tasa usada y moneda funcional. */
  conversionNote: string
}

export interface LineageNode {
  kind: 'CIFRA' | 'DOCUMENTO' | 'LINEA_CARGA'
  label: string
  value: string
  detail: string
  /** `balance_GT1_V2.csv#fila8` cuando el nodo es una fila de archivo. */
  origin?: string
}

export interface DocumentEvent { event: string; actor: string; detail: string; at?: string }

/** Respuesta de GET /ic/documents/{key} (propuesta). */
export interface IcDocumentDetail {
  key: IcDocumentKey
  version: number
  type: IcType
  issuer: CompanyCode
  receiver: CompanyCode
  status: DocumentStatus
  result: ReconciliationResult
  receivable: DocumentLeg
  payable: DocumentLeg
  lineage: LineageNode[]
  lineageOk: boolean
  /** Ciclo de vida ordenado con el estado alcanzado. */
  lifecycle: { status: DocumentStatus; label: string; reached: boolean; current: boolean }[]
  events: DocumentEvent[]
}
