import { TrendingDown, TrendingUp } from 'lucide-react'
import { BarMeter } from '@/shared/ui'
import { formatSigned } from '@/shared/format/number'
import { directionOf, effectCompaniesLabel, maxEffect } from '../domain/bridge'
import type { BridgeEffect } from '../domain/types'
import s from './EffectList.module.css'

/** Vista móvil de la cascada: cada efecto con signo, ícono de dirección y barra. */
export function EffectList({ effects }: { effects: BridgeEffect[] }) {
  const max = maxEffect(effects.map(e => e.value))
  return (
    <ul className={s.list} aria-label="Efectos">
      {effects.map(e => {
        const dir = directionOf(e.value)
        const Icon = dir === 'down' ? TrendingDown : TrendingUp
        return (
          <li key={e.id} className={s.item}>
            <div className={s.line}>
              <span className={s.name}><Icon size={16} aria-hidden className={dir === 'down' ? s.down : s.up} />{e.label}</span>
              <span className={`${s.value} ${dir === 'down' ? s.down : s.up}`}>{formatSigned(e.value)}</span>
            </div>
            <BarMeter value={e.value} max={max} tone={dir === 'down' ? 'orange' : 'blue'} label={`${e.label}: ${formatSigned(e.value)}`} />
            <span className={s.companies}>{effectCompaniesLabel(e)}</span>
          </li>
        )
      })}
    </ul>
  )
}
