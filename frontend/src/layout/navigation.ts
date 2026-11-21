import type { LucideIcon } from 'lucide-react'
import { ArrowLeftRight, ChartColumn, CircleDollarSign, CircleMinus, FileText, Grid3x3, LayoutGrid, Link2, Upload } from 'lucide-react'

export type StepGroup = 'INICIO' | 'VALIDAR' | 'CONCILIAR' | 'CONVERTIR' | 'ELIMINAR' | 'EXPLICAR'

export interface NavItem {
  path: string
  label: string
  icon: LucideIcon
  group: StepGroup
  /** Pestaña de la barra inferior en móvil; los que no tienen viven en "Más". */
  mobileTab?: 'inicio' | 'validar' | 'conciliar' | 'explicar'
  /** No aparece en menús (p. ej. detalle de documento). */
  hidden?: boolean
}

/** Única fuente de la navegación (abierto a extensión: agregar un módulo = agregar una entrada). */
export const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Presupuesto consolidado', icon: LayoutGrid, group: 'INICIO', mobileTab: 'inicio' },
  { path: '/validacion', label: 'Carga y validación', icon: Upload, group: 'VALIDAR', mobileTab: 'validar' },
  { path: '/conciliacion', label: 'Conciliación', icon: Link2, group: 'CONCILIAR', mobileTab: 'conciliar' },
  { path: '/cuenta-corriente', label: 'Cuenta corriente', icon: Grid3x3, group: 'CONCILIAR' },
  { path: '/documentos', label: 'Documento y linaje', icon: FileText, group: 'CONCILIAR', hidden: true },
  { path: '/tasas', label: 'Tasas del grupo', icon: CircleDollarSign, group: 'CONVERTIR' },
  { path: '/eliminaciones', label: 'Eliminaciones', icon: CircleMinus, group: 'ELIMINAR' },
  { path: '/rentabilidad', label: 'Rentabilidad', icon: ChartColumn, group: 'EXPLICAR' },
  { path: '/desviaciones', label: 'Desviaciones', icon: ArrowLeftRight, group: 'EXPLICAR', mobileTab: 'explicar' },
]

export const STEP_GROUPS: { group: StepGroup; label: string; step?: number }[] = [
  { group: 'INICIO', label: 'Inicio' },
  { group: 'VALIDAR', label: 'Validar', step: 1 },
  { group: 'CONCILIAR', label: 'Conciliar', step: 2 },
  { group: 'CONVERTIR', label: 'Convertir', step: 3 },
  { group: 'ELIMINAR', label: 'Eliminar', step: 4 },
  { group: 'EXPLICAR', label: 'Explicar', step: 5 },
]

export const visibleItems = (group?: StepGroup) => NAV_ITEMS.filter(i => !i.hidden && (!group || i.group === group))

/** Grupo activo según la ruta, para resaltar el paso en riel y barra inferior. */
export function groupForPath(pathname: string): StepGroup {
  const match = [...NAV_ITEMS].sort((a, b) => b.path.length - a.path.length).find(i => i.path === '/' ? pathname === '/' : pathname.startsWith(i.path))
  return match?.group ?? 'INICIO'
}
