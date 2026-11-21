import { Link, useSearchParams } from 'react-router-dom'
import { Info } from 'lucide-react'
import { Card, CardHeader, ResponsiveTable, textTone } from '@/shared/ui'
import type { Column } from '@/shared/ui'
import { agreedLabel, differenceLabel, routeLabel, toleranceLabel } from '../domain/results'
import { formatMoney } from '@/shared/format/number'
import { icTypeLabel } from '../domain/filters'
import type { IcPair, ReconciliationReport } from '../domain/types'
import { ResultChip } from '@/entities/ic'
import s from './PairsTable.module.css'

function DocumentLink({ pairKey }: { pairKey: string }) {
  const [params] = useSearchParams()
  const esc = params.get('esc')
  return <Link className={s.key} to={`/documentos/${encodeURIComponent(pairKey)}${esc ? '?esc=' + encodeURIComponent(esc) : ''}`} aria-label={`Ver documento ${pairKey}`}>{pairKey}</Link>
}

function diffClass(value: number) {
  return Math.abs(value) < 0.005 ? textTone.ink : textTone.blue
}

const columns: Column<IcPair>[] = [
  { key: 'key', header: 'Llave', render: p => <DocumentLink pairKey={p.key} /> },
  { key: 'type', header: 'Tipo', hideBelow: 'lg', render: p => <span className={s.muted}>{icTypeLabel(p.type)}</span> },
  { key: 'route', header: 'Ruta', render: p => <strong className={s.route}>{routeLabel(p)}</strong> },
  { key: 'issuerUsd', header: 'Emisor USD', numeric: true, render: p => formatMoney(p.issuerUsd, 'USD', 2) },
  { key: 'receiverUsd', header: 'Receptor USD', numeric: true, render: p => formatMoney(p.receiverUsd, 'USD', 2) },
  { key: 'agreed', header: 'Monto pactado', numeric: true, render: p => agreedLabel(p.agreed) },
  { key: 'diff', header: 'Dif. USD', numeric: true, render: p => <span className={diffClass(p.differenceUsd)}>{differenceLabel(p.differenceUsd)}</span> },
  { key: 'result', header: 'Resultado', render: p => <ResultChip result={p.result} /> },
]

function PairCard({ pair }: { pair: IcPair }) {
  return (
    <article className={s.card}>
      <div className={s.cardTop}><DocumentLink pairKey={pair.key} /><ResultChip result={pair.result} /></div>
      <div className={s.cardBody}>
        <div>
          <strong className={s.route}>{routeLabel(pair)}</strong>
          <span className={s.cardType}>{icTypeLabel(pair.type)}</span>
        </div>
        <div className={s.cardAmount}>
          <strong>{pair.agreed ? agreedLabel(pair.agreed) : `${formatMoney(pair.issuerUsd, 'USD', 2)} emisor`}</strong>
          <span className={diffClass(pair.differenceUsd)}>Dif. USD {differenceLabel(pair.differenceUsd)}</span>
        </div>
      </div>
    </article>
  )
}

export function PairsTable({ report }: { report: ReconciliationReport }) {
  return (
    <Card>
      <CardHeader title="Pares CxC ↔ CxP espejo" aside={`${report.pairs.length} de ${report.totals.documents}`} />
      <ResponsiveTable
        caption="Pares de documentos intercompany: llave, tipo, ruta, monto pactado, diferencia y resultado"
        columns={columns} rows={report.pairs} rowKey={p => p.key + (p.statement ?? '')} renderCard={p => <PairCard pair={p} />}
      />
      <p className={s.note}>
        <Info size={16} aria-hidden />
        <span>Tolerancia por documento: {toleranceLabel(report.tolerance)}. La diferencia cambiaria nunca se mezcla con una diferencia de monto.</span>
      </p>
    </Card>
  )
}
