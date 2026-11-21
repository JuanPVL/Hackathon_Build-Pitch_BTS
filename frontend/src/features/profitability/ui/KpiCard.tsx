import { ChevronRight } from 'lucide-react'
import { Card, Eyebrow } from '@/shared/ui'
import { formatByUnit } from '../domain/profitability'
import type { KpiBreakdown } from '../domain/types'
import s from './KpiCard.module.css'

/** Un KPI con su fórmula y los componentes de los que sale (el linaje se conecta después). */
export function KpiCard({ kpi }: { kpi: KpiBreakdown }) {
  const label = kpi.code === 'EVA' ? 'EVA · USD' : kpi.code
  return (
    <Card as="article" aria-label={kpi.code}>
      <Eyebrow>{label}</Eyebrow>
      <h2 className="q-sr-only">{kpi.code}</h2>
      <p className={`${s.value} ${kpi.value < 0 ? s.neg : ''}`}>{formatByUnit(kpi.value, kpi.unit)}</p>
      <p className={s.formula}>{kpi.formula}</p>
      <ul className={s.components}>
        {kpi.components.map(c => (
          <li key={c.label} className={s.component}>
            <span className={s.componentLabel}>{c.label}</span>
            <span className={s.componentValue}>{formatByUnit(c.value, c.unit)}<ChevronRight size={14} aria-hidden /></span>
          </li>
        ))}
      </ul>
      <p className={s.note}>{kpi.note}</p>
    </Card>
  )
}
