import { Card, BarMeter, Eyebrow } from '@/shared/ui'
import { formatAmount } from '@/shared/format/number'
import { maxAbs, sortEvaDesc } from '../domain/consolidation'
import type { ConsolidationSummary } from '../domain/types'
import s from './EvaByCompanyCard.module.css'

export function EvaByCompanyCard({ rows }: { rows: ConsolidationSummary['evaByCompany'] }) {
  const sorted = sortEvaDesc(rows)
  const max = maxAbs(sorted.map(r => r.eva))
  return (
    <Card>
      <Eyebrow>Valor económico · stand-alone</Eyebrow>
      <h2 className={s.title}>EVA por empresa</h2>
      <p className={s.sub}>Quién crea y quién destruye valor.</p>
      <ul className={s.list}>
        {sorted.map(r => (
          <li key={r.company} className={s.row}>
            <div className={s.line}>
              <span><strong className={s.code}>{r.company}</strong> <span className={s.name}>{r.name}</span></span>
              <span className={`${s.value} ${r.eva < 0 ? s.neg : ''}`}>{formatAmount(r.eva)}</span>
            </div>
            <BarMeter value={r.eva} max={max} tone={r.eva < 0 ? 'red' : 'blue'} label={`EVA de ${r.name}: ${formatAmount(r.eva)}`} />
          </li>
        ))}
      </ul>
    </Card>
  )
}
