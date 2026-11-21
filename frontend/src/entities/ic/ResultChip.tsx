import { ArrowLeftRight, Check, CircleAlert, CalendarClock, Unlink } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Chip } from '@/shared/ui'
import { resultInfo } from './results'
import type { ReconciliationResult } from './types'

const ICONS: Record<ReconciliationResult, LucideIcon> = {
  CONCILIADO: Check,
  CONCILIADO_FX: ArrowLeftRight,
  DIFERENCIA_MONTO: CircleAlert,
  DIFERENCIA_CORTE: CalendarClock,
  SIN_CONTRAPARTE: Unlink,
  FX_FUERA_TOLERANCIA: CircleAlert,
}

/** Chip de resultado: tono + ícono + texto (nada se comunica solo con color). */
export function ResultChip({ result, variant = 'short', label }: { result: ReconciliationResult; variant?: 'short' | 'full'; label?: string }) {
  const info = resultInfo(result)
  return <Chip tone={info.tone} icon={ICONS[result]}>{label ?? (variant === 'short' ? info.shortLabel : info.label)}</Chip>
}
