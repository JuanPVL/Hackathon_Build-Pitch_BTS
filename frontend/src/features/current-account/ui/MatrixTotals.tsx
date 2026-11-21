import { StatCard } from '@/shared/ui'
import { formatAmount } from '@/shared/format/number'
import type { BalanceMatrix } from '../domain/types'
import s from './MatrixTotals.module.css'

export function MatrixTotals({ totals }: { totals: BalanceMatrix['totals'] }) {
  return (
    <div className={s.grid}>
      <StatCard label="Documentos IC" value={formatAmount(totals.documents)} valueTone="ink" />
      <StatCard label="Conciliados exactos" value={formatAmount(totals.exact)} valueTone="green" />
      <StatCard label="Con diferencia FX" value={formatAmount(totals.fx)} valueTone="blue" />
      <StatCard label="Sin contraparte" value={formatAmount(totals.orphan)} valueTone="ink" />
      <StatCard label="En disputa" value={formatAmount(totals.disputed)} valueTone="ink" />
    </div>
  )
}
