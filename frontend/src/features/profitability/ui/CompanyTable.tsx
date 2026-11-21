import { Check, TriangleAlert } from 'lucide-react'
import { Card, CardHeader, Chip, ResponsiveTable } from '@/shared/ui'
import type { Column } from '@/shared/ui'
import { formatPercent } from '@/shared/format/number'
import { signedEva, sortByEva, verdictOf } from '../domain/profitability'
import type { CompanyProfitability } from '../domain/types'
import s from './CompanyTable.module.css'

function Verdict({ eva }: { eva: number }) {
  return verdictOf(eva) === 'crea'
    ? <Chip tone="ok" icon={Check}>Crea valor</Chip>
    : <Chip tone="err" icon={TriangleAlert}>Destruye</Chip>
}

const tone = (v: number) => (v < 0 ? s.neg : s.pos)

const columns: Column<CompanyProfitability>[] = [
  { key: 'company', header: 'Empresa', render: r => <span><strong className={s.code}>{r.company}</strong> <span className={s.name}>{r.name}</span></span> },
  { key: 'roic', header: 'ROIC', numeric: true, render: r => <span className={tone(r.roic)}>{formatPercent(r.roic)}</span> },
  { key: 'roce', header: 'ROCE', numeric: true, render: r => <span className={tone(r.roce)}>{formatPercent(r.roce)}</span> },
  { key: 'eva', header: 'EVA', numeric: true, render: r => <span className={tone(r.eva)}>{signedEva(r.eva)}</span> },
  { key: 'verdict', header: 'Veredicto', align: 'right', render: r => <Verdict eva={r.eva} /> },
]

export function CompanyTable({ rows, wacc }: { rows: CompanyProfitability[]; wacc: number }) {
  return (
    <Card>
      <CardHeader title="Por empresa · stand-alone en USD" aside={`WACC ${formatPercent(wacc, 0)}`} />
      <ResponsiveTable
        caption="Rentabilidad por empresa"
        columns={columns}
        rows={sortByEva(rows)}
        rowKey={r => r.company}
        renderCard={r => (
          <div className={s.card}>
            <div className={s.cardHead}>
              <span><strong className={s.code}>{r.company}</strong> <span className={s.name}>{r.name}</span></span>
              <Verdict eva={r.eva} />
            </div>
            <dl className={s.metrics}>
              <div><dt>ROIC</dt><dd className={tone(r.roic)}>{formatPercent(r.roic)}</dd></div>
              <div><dt>ROCE</dt><dd className={tone(r.roce)}>{formatPercent(r.roce)}</dd></div>
              <div><dt>EVA</dt><dd className={tone(r.eva)}>{signedEva(r.eva)}</dd></div>
            </dl>
          </div>
        )}
      />
    </Card>
  )
}
