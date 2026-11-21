import { TrendingDown, TrendingUp } from 'lucide-react'
import { BarMeter, Card, CardHeader } from '@/shared/ui'
import { formatSigned } from '@/shared/format/number'
import { directionOf, maxEffect, topCompanyEffects } from '../domain/bridge'
import type { CompanyEffect } from '../domain/types'
import s from './CompanyCausesCard.module.css'

export function CompanyCausesCard({ rows }: { rows: CompanyEffect[] }) {
  const top = topCompanyEffects(rows)
  const max = maxEffect(top.map(r => r.value))
  return (
    <Card>
      <CardHeader title="Top causas por empresa" />
      <ul className={s.list}>
        {top.map(r => {
          const down = directionOf(r.value) === 'down'
          const Icon = down ? TrendingDown : TrendingUp
          return (
            <li key={`${r.effect}-${r.company}`} className={s.row}>
              <span className={s.company}>{r.company}</span>
              <span className={s.label}>{r.label}</span>
              <span className={s.meter}><BarMeter value={r.value} max={max} tone={down ? 'orange' : 'blue'} label={`${r.label} ${r.company}: ${formatSigned(r.value)}`} /></span>
              <span className={`${s.value} ${down ? s.down : s.up}`}><Icon size={14} aria-hidden />{formatSigned(r.value)}</span>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
