import { formatMoney } from '@/shared/format/number'
import type { Money } from '@/entities'
import type { IcType, ReconciliationResult } from './types'

/** Tono visual de un resultado (se traduce a un Chip en la capa ui). */
export type ResultTone = 'ok' | 'info' | 'warn' | 'err'

export interface ResultInfo {
  result: ReconciliationResult
  /** Nombre completo ("Diferencia cambiaria"). */
  label: string
  /** Nombre corto para chips de tabla ("Dif. cambiaria"). */
  shortLabel: string
  /** Texto del chip del documento ("Conciliado FX"). */
  mirrorLabel: string
  tone: ResultTone
  /** Qué significa el resultado. */
  description: string
  /** Qué hace el sistema con el resultado (texto fijo). */
  action: string
}

/** Orden en que se presentan los resultados: de "cuadra" a "alerta". */
export const RESULT_ORDER: readonly ReconciliationResult[] = [
  'CONCILIADO', 'CONCILIADO_FX', 'DIFERENCIA_MONTO', 'DIFERENCIA_CORTE', 'SIN_CONTRAPARTE', 'FX_FUERA_TOLERANCIA',
]

const RESULTS: Record<ReconciliationResult, ResultInfo> = {
  CONCILIADO: {
    result: 'CONCILIADO', label: 'Conciliado', shortLabel: 'Conciliado', mirrorLabel: 'Conciliado', tone: 'ok',
    description: 'Mismo documento y mismo monto', action: 'Se elimina al consolidar',
  },
  CONCILIADO_FX: {
    result: 'CONCILIADO_FX', label: 'Diferencia cambiaria', shortLabel: 'Dif. cambiaria', mirrorLabel: 'Conciliado FX', tone: 'info',
    description: 'Mismo monto pactado; cambia la conversión', action: 'Concilia y lleva la diferencia a 7900',
  },
  DIFERENCIA_MONTO: {
    result: 'DIFERENCIA_MONTO', label: 'Diferencia de monto', shortLabel: 'Dif. de monto', mirrorLabel: 'Diferencia de monto', tone: 'err',
    description: 'Cada empresa registró un monto distinto', action: 'Alerta a las dos; no elimina a la fuerza',
  },
  DIFERENCIA_CORTE: {
    result: 'DIFERENCIA_CORTE', label: 'Corte', shortLabel: 'Corte', mirrorLabel: 'Diferencia de corte', tone: 'warn',
    description: 'Una empresa lo registró en otro mes', action: 'Alerta con los dos meses',
  },
  SIN_CONTRAPARTE: {
    result: 'SIN_CONTRAPARTE', label: 'Sin contraparte', shortLabel: 'Sin contraparte', mirrorLabel: 'Sin contraparte', tone: 'err',
    description: 'Solo existe una de las dos patas', action: 'Alerta: falta la factura en la otra',
  },
  FX_FUERA_TOLERANCIA: {
    result: 'FX_FUERA_TOLERANCIA', label: 'FX fuera de tolerancia', shortLabel: 'FX fuera de tol.', mirrorLabel: 'FX fuera de tolerancia', tone: 'warn',
    description: 'La diferencia cambiaria supera la tolerancia', action: 'Alerta: revisar tasas antes de eliminar',
  },
}

export function resultInfo(result: ReconciliationResult): ResultInfo {
  return RESULTS[result]
}

/** "GTQ 65,000" */
export function agreedLabel(money: Money | null): string {
  return money ? formatMoney(money.amount, money.currency) : 'No disponible'
}

const TYPE_LABELS: Record<IcType, string> = { VENTA: 'Venta', GESTION: 'Gestión', PRESTAMO: 'Préstamo', INTERES: 'Intereses' }

export function icTypeLabel(type: IcType | null): string {
  return type ? TYPE_LABELS[type] : 'No disponible'
}
