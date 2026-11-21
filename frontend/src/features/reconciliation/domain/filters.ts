import type { IcType } from './types'

export type TypeFilterValue = 'TODAS' | IcType

export const TYPE_FILTER_OPTIONS: { value: TypeFilterValue; label: string }[] = [
  { value: 'TODAS', label: 'Todas' },
  { value: 'VENTA', label: 'Ventas' },
  { value: 'GESTION', label: 'Servicios de gestión' },
  { value: 'PRESTAMO', label: 'Préstamos' },
  { value: 'INTERES', label: 'Intereses' },
]

export { icTypeLabel } from '@/entities/ic'

/** Valor de `?tipo=` de la URL → filtro; cualquier valor desconocido equivale a "Todas". */
export function parseTypeFilter(raw: string | null): TypeFilterValue {
  return TYPE_FILTER_OPTIONS.some(o => o.value === raw) ? (raw as TypeFilterValue) : 'TODAS'
}

export function filterToIcType(value: TypeFilterValue): IcType | undefined {
  return value === 'TODAS' ? undefined : value
}
