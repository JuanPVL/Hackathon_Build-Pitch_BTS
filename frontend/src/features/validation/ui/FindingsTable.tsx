import type { ReactNode } from 'react'
import { DataTable } from '@/shared/ui'
import type { Column } from '@/shared/ui'
import { Chip } from '@/shared/ui'
import { formatAmount } from '@/shared/format/number'
import type { Finding } from '../domain/types'
import { severityLabel, severityTone } from '../domain/validation'
import s from './FindingsTable.module.css'

export interface RankedFinding extends Finding { rank: number }

function SeverityMark({ finding }: { finding: Finding }) {
  return (
    <>
      <Chip square tone={severityTone(finding.severity)}>{finding.severity}</Chip>
      <span className="q-sr-only">{severityLabel(finding.severity)}</span>
    </>
  )
}

const columns: Column<RankedFinding>[] = [
  { key: 'rank', header: '#', render: f => <span className={s.rank}>{f.rank}</span>, width: 36 },
  { key: 'rule', header: 'Regla', render: f => <strong className={s.rule}>{f.rule}</strong>, width: 64 },
  { key: 'sev', header: 'Sev.', render: f => <SeverityMark finding={f} />, width: 56 },
  { key: 'scope', header: 'Empresa', render: f => <span className={s.scope}>{f.scope}</span>, width: 104 },
  {
    key: 'message', header: 'Hallazgo',
    render: f => (<div className={s.message}><span>{f.message}</span><code className={s.record}>{f.record}</code></div>),
  },
  { key: 'impact', header: 'Impacto USD', numeric: true, render: f => <span className={s.impact}>{formatAmount(f.impactUsd)}</span> },
]

export function FindingsTable({ rows, selectedId, onSelect }: { rows: RankedFinding[]; selectedId: string | undefined; onSelect: (f: Finding) => void }) {
  return (
    <DataTable
      caption="Hallazgos de la validación, ordenados por impacto en USD"
      columns={columns}
      rows={rows}
      rowKey={f => f.id}
      onRowClick={onSelect}
      selectedKey={selectedId}
    />
  )
}

/** Tarjeta móvil: el encabezado es un botón; el detalle (si está seleccionada) llega como `children`. */
export function FindingCard({ finding, selected, onSelect, children }: { finding: Finding; selected: boolean; onSelect: () => void; children?: ReactNode }) {
  return (
    <article className={`${s.card} ${selected ? s.cardSelected : ''}`}>
      <button type="button" className={s.cardButton} aria-expanded={selected} onClick={onSelect}>
        <span className={s.cardTop}>
          <span className={s.ruleTag}>{finding.rule}</span>
          <Chip tone={severityTone(finding.severity)}>{severityLabel(finding.severity)}</Chip>
          <span className={s.cardScope}>{finding.scope}</span>
        </span>
        <span className={s.cardMessage}>{finding.message}</span>
        <code className={s.cardRecord}>{finding.record}</code>
        <span className={s.cardImpactRow}>
          <span className={s.cardImpactLabel}>Impacto USD</span>
          <span className={s.cardImpact}>{formatAmount(finding.impactUsd)}</span>
        </span>
      </button>
      {selected && children && <div className={s.cardDetail}>{children}</div>}
    </article>
  )
}
