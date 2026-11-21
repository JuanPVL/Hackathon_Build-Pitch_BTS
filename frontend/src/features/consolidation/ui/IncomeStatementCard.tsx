import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, GitBranch, X } from 'lucide-react'
import { Button, Card, CardHeader, Chip, ResponsiveTable, SegmentedControl, textTone, toneForSign } from '@/shared/ui'
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

function AccountCard({ line, onSelect }: { line: AccountLine; onSelect: (l: AccountLine) => void }) {
  const note = eliminationNote(line)
  return (
    <div className={`${s.card} ${line.isIntercompany ? s.ic : ''}`} onClick={() => onSelect(line)} role="button" tabIndex={0}>
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
  const [selectedLine, setSelectedLine] = useState<AccountLine | null>(null)
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
            onChange={v => { setStatement(v); setSelectedLine(null) }}
            options={[{ value: 'PL', label: 'P&L' }, { value: 'BALANCE', label: 'Balance' }]}
          />
        }
      />
      <ResponsiveTable
        caption={title}
        columns={columns}
        rows={rows}
        rowKey={l => l.account}
        selectedKey={selectedLine?.account}
        onRowClick={line => setSelectedLine(prev => (prev?.account === line.account ? null : line))}
        rowVariant={l => (l.isIntercompany ? 'highlight' : undefined)}
        renderCard={line => <AccountCard line={line} onSelect={setSelectedLine} />}
      />
      {selectedLine && (
        <div
          aria-label={`Linaje de la cuenta ${selectedLine.account}`}
          style={{
            marginTop: 14,
            padding: 16,
            borderRadius: 12,
            background: 'var(--q-navy, #0F2341)',
            color: '#fff',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <GitBranch size={16} aria-hidden />
              <strong>Linaje de cuenta {selectedLine.account} · {selectedLine.name}</strong>
              <Chip tone="ok">Trazable a corrida {summary.runId}</Chip>
            </div>
            <Button variant="ghost" icon={X} onClick={() => setSelectedLine(null)}>Cerrar</Button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, fontSize: 13 }}>
            <div style={{ padding: 10, borderRadius: 8, background: 'rgba(255,255,255,0.08)' }}>
              <div style={{ opacity: 0.75 }}>Suma agregada (6 empresas)</div>
              <strong style={{ fontSize: 16 }}>USD {formatAmount(selectedLine.aggregate)}</strong>
            </div>
            <div style={{ padding: 10, borderRadius: 8, background: 'rgba(255,255,255,0.08)' }}>
              <div style={{ opacity: 0.75 }}>Eliminación intercompany</div>
              <strong style={{ fontSize: 16, color: '#F59E0B' }}>USD {formatSigned(selectedLine.elimination)}</strong>
            </div>
            <div style={{ padding: 10, borderRadius: 8, background: 'rgba(255,255,255,0.14)' }}>
              <div style={{ opacity: 0.85 }}>Consolidado final</div>
              <strong style={{ fontSize: 16 }}>USD {formatAmount(selectedLine.consolidated)}</strong>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, fontSize: 12 }}>
            <span style={{ opacity: 0.85 }}>
              Cada cifra proviene de las 12 cargas aprobadas (P&amp;L y Balance) convertidas bajo NIC 21 en la corrida inmutable.
            </span>
            <div style={{ display: 'flex', gap: 10 }}>
              <Link to={`/corridas/${encodeURIComponent(summary.runId)}`} style={{ color: '#93C5FD', fontWeight: 600 }}>
                Ver cargas de origen →
              </Link>
              {hasElimination(selectedLine) && (
                <Link to="/eliminaciones" style={{ color: '#FCD34D', fontWeight: 600 }}>
                  Ver asientos de eliminación →
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}
