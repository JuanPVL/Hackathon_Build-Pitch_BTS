import { statusInfo } from '../domain/matrix'
import type { CellStatus } from '../domain/matrix'
import s from './StatusDot.module.css'

/** Estado de conciliación: punto de color + texto (nunca solo color). */
export function StatusDot({ status, long }: { status: CellStatus; long?: boolean }) {
  const info = statusInfo(status)
  return (
    <span className={s.status}>
      <i className={`${s.dot} ${s[info.tone]}`} aria-hidden />
      {long ? info.long : info.short}
    </span>
  )
}
