import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Info } from 'lucide-react'
import { Button, Card, CardHeader, ResponsiveTable, textTone } from '@/shared/ui'
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
  const [params] = useSearchParams()
  const esc = params.get('esc')
  const [resultFilter, setResultFilter] = useState<'TODOS' | 'CONCILIADO' | 'CONCILIADO_FX' | 'ALERTA'>('TODOS')
  const [searchTerm, setSearchTerm] = useState('')

  const visiblePairs = report.pairs.filter(p => {
    if (resultFilter === 'CONCILIADO' && p.result !== 'CONCILIADO') return false
    if (resultFilter === 'CONCILIADO_FX' && p.result !== 'CONCILIADO_FX') return false
    if (resultFilter === 'ALERTA' && (p.result === 'CONCILIADO' || p.result === 'CONCILIADO_FX')) return false
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toUpperCase()
      return (
        p.key.toUpperCase().includes(q) ||
        (p.issuer ?? '').toUpperCase().includes(q) ||
        (p.receiver ?? '').toUpperCase().includes(q)
      )
    }
    return true
  })

  return (
    <Card>
      <CardHeader title="Pares CxC ↔ CxP espejo" aside={`${visiblePairs.length} de ${report.totals.documents}`} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {([
            ['TODOS', 'Todos los resultados'],
            ['CONCILIADO', 'Cuadran exacto'],
            ['CONCILIADO_FX', 'Dif. cambiaria'],
            ['ALERTA', 'Con diferencia / Sin pareja'],
          ] as const).map(([code, label]) => (
            <Button
              key={code}
              variant={resultFilter === code ? 'primary' : 'secondary'}
              onClick={() => setResultFilter(code)}
            >
              {label}
            </Button>
          ))}
        </div>
        <input
          type="search"
          placeholder="Buscar por llave o empresa (ej. GT1, IC-F5)…"
          aria-label="Buscar documento o empresa"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{ minHeight: 34, padding: '4px 10px', borderRadius: 8, border: '1px solid var(--q-line)', minWidth: 240, fontSize: 13 }}
        />
      </div>
      <ResponsiveTable
        caption="Pares de documentos intercompany: llave, tipo, ruta, monto pactado, diferencia y resultado"
        columns={columns}
        rows={visiblePairs}
        rowKey={p => p.key + (p.statement ?? '')}
        onRowClick={p => {
          window.location.assign(`/documentos/${encodeURIComponent(p.key)}${esc ? '?esc=' + encodeURIComponent(esc) : ''}`)
        }}
        renderCard={p => <PairCard pair={p} />}
      />
      <p className={s.note}>
        <Info size={16} aria-hidden />
        <span>Tolerancia por documento: {toleranceLabel(report.tolerance)}. La diferencia cambiaria nunca se mezcla con una diferencia de monto.</span>
      </p>
    </Card>
  )
}
