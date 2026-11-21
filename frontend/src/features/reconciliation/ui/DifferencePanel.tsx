import { Card, CardHeader } from '@/shared/ui'
import { formatAmount } from '@/shared/format/number'
import { orderedResultCounts, resultInfo } from '../domain/results'
import type { ReconciliationReport } from '../domain/types'
import { ResultChip } from '@/entities/ic'
import s from './DifferencePanel.module.css'

/** "Cada diferencia tiene nombre": qué es cada resultado y qué hace el sistema con él. */
export function DifferencePanel({ byResult }: { byResult: ReconciliationReport['byResult'] }) {
  return (
    <Card>
      <CardHeader title="Cada diferencia tiene nombre" />
      <ul className={s.list}>
        {orderedResultCounts(byResult).map(({ result, count }) => {
          const info = resultInfo(result)
          return (
            <li key={result} className={s.item}>
              <span className={`${s.count} ${count === 0 ? s.zero : ''}`}>{formatAmount(count)}</span>
              <div className={s.text}>
                <span><ResultChip result={result} variant="full" /></span>
                <span className={s.desc}>{info.description}</span>
                <strong className={s.action}>{info.action}</strong>
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
