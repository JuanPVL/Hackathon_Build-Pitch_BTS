import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Card, CardHeader, ResponsiveTable, SegmentedControl, textTone, toneForSign } from '@/shared/ui'
import type { Column } from '@/shared/ui'
import { formatAmount, formatSigned } from '@/shared/format/number'
import { eliminationNote, hasElimination } from '../domain/consolidation'
import type { AccountLine, ConsolidationSummary } from '../domain/types'
import s from './IncomeStatementCard.module.css'

type Statement = 'PL' | 'BALANCE'

const columns: Column<AccountLine>[] = [
  { key: 'account', header: 'Cuenta', render: l => <span className={s.account}>{l.account}</span>, width: 80 },
  { key: 'name', header: 'Nombre', render: l => l.name },
  { key: 'aggregate', header: 'Agregado', numeric: true, hideBelow: 'lg', render: l => <span className={s.plain}>{formatAmount(l.aggregate)}</span> },
  {
    key: 'elimination', header: 'Eliminación', numeric: true,
    render: l => hasElimination(l) ? <span className={textTone.orange}>{formatSigned(l.elimination)}</span> : <span aria-label="sin eliminación">—</span>,
  },
  {
    key: 'consolidated', header: 'Consolidado', numeric: true,
    render: l => <span className={`${s.consolidated} ${textTone[toneForSign(l.consolidated) === 'muted' ? 'blue' : toneForSign(l.consolidated)]}`}>{formatAmount(l.consolidated)}<ChevronRight size={14} aria-hidden /></span>,
  },
]

function AccountCard({ line }: { line: AccountLine }) {
  const note = eliminationNote(line)
  return (
    <div className={`${s.card} ${line.isIntercompany ? s.ic : ''}`}>
      <div className={s.cardMain}>
        <span className={s.cardName}><span className={s.account}>{line.account}</span> {line.name}</span>
        <span className={s.cardValue}>{formatAmount(line.consolidated)}</span>
      </div>
      {note && <span className={`${s.note} ${textTone.orange}`}>{note}</span>}
    </div>
  )
}

export function IncomeStatementCard({ summary }: { summary: ConsolidationSummary }) {
  const [statement, setStatement] = useState<Statement>('PL')
  const rows = statement === 'PL' ? summary.incomeStatement : summary.balanceSheet
  const title = statement === 'PL' ? 'Estado de resultados consolidado' : 'Balance consolidado'
  return (
    <Card>
      <CardHeader
        title={title}
        aside={
          <SegmentedControl<Statement>
            label="Estado financiero"
            value={statement}
            onChange={setStatement}
            options={[{ value: 'PL', label: 'P&L' }, { value: 'BALANCE', label: 'Balance' }]}
          />
        }
      />
      <ResponsiveTable
        caption={title}
        columns={columns}
        rows={rows}
        rowKey={l => l.account}
        rowVariant={l => (l.isIntercompany ? 'highlight' : undefined)}
        renderCard={line => <AccountCard line={line} />}
      />
    </Card>
  )
}
