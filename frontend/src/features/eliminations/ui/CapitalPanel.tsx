import { Equal, Minus } from 'lucide-react'
import { Callout, Card, CardHeader } from '@/shared/ui'
import { formatAmount, formatCompact, formatPercent } from '@/shared/format/number'
import type { EliminationReport } from '../domain/types'
import { capitalBalances, roceGapPoints } from '../domain/eliminations'
import s from './CapitalPanel.module.css'

function gapText(points: number): string {
  const abs = formatAmount(Math.abs(points), 2)
  if (points > 0) return `sin eliminar, el ROCE del grupo se ve ${abs} puntos peor.`
  if (points < 0) return `sin eliminar, el ROCE del grupo se ve ${abs} puntos mejor.`
  return 'el ROCE no cambia al eliminar.'
}

/** Capital sin eliminar − préstamo y saldos IC = capital del grupo; ROCE antes y después. */
export function CapitalPanel({ capital }: { capital: EliminationReport['capital'] }) {
  const balances = capitalBalances(capital)
  return (
    <Card aria-label="Capital empleado">
      <CardHeader title="El préstamo entre empresas infla el capital" />
      <div className={s.stack}>
        <div className={s.box}>
          <span className={s.label}>Capital empleado sin eliminar</span>
          <span className={s.value}>{formatCompact(capital.employedBefore)}</span>
        </div>
        <div className={`${s.box} ${s.boxCream}`}>
          <span className={s.label}><Minus size={12} aria-hidden /> Préstamo y saldos IC</span>
          <span className={`${s.value} ${s.orange}`}>{formatCompact(capital.icRemoved)}</span>
        </div>
        <div className={`${s.box} ${s.boxNavy}`}>
          <span className={`${s.label} ${s.onDark}`}><Equal size={12} aria-hidden /> Capital empleado del grupo</span>
          <span className={`${s.value} ${s.light}`}>{formatCompact(capital.employedAfter)}</span>
        </div>
        {!balances && <Callout tone="err" title="El capital no cuadra.">Capital sin eliminar menos intercompany no es igual al capital del grupo.</Callout>}
        <div className={s.roce}>
          <div className={`${s.box} ${s.boxOutlined}`}>
            <span className={s.label}>ROCE sin eliminar</span>
            <span className={`${s.value} ${s.muted}`}>{formatPercent(capital.roceBefore)}</span>
          </div>
          <div className={`${s.box} ${s.boxNavy}`}>
            <span className={`${s.label} ${s.accent}`}>ROCE correcto</span>
            <span className={`${s.value} ${s.light}`}>{formatPercent(capital.roceAfter)}</span>
          </div>
        </div>
        <p className={s.note}>Mismo dato, otra decisión: {gapText(roceGapPoints(capital))}</p>
      </div>
    </Card>
  )
}
