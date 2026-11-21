import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, GitBranch } from 'lucide-react'
import { Card, Eyebrow } from '@/shared/ui'
import { formatByUnit } from '../domain/profitability'
import type { KpiBreakdown, KpiComponent } from '../domain/types'
import s from './KpiCard.module.css'

/** Un KPI con su fórmula y los componentes de los que sale (con linaje interactivo al hacer clic). */
export function KpiCard({ kpi }: { kpi: KpiBreakdown }) {
  const [selectedComp, setSelectedComp] = useState<KpiComponent | null>(null)
  const label = kpi.code === 'EVA' ? 'EVA · USD' : kpi.code
  return (
    <Card as="article" aria-label={kpi.code}>
      <Eyebrow>{label}</Eyebrow>
      <h2 className="q-sr-only">{kpi.code}</h2>
      <p className={`${s.value} ${kpi.value < 0 ? s.neg : ''}`}>{formatByUnit(kpi.value, kpi.unit)}</p>
      <p className={s.formula}>{kpi.formula}</p>
      <ul className={s.components}>
        {kpi.components.map(c => (
          <li
            key={c.label}
            className={s.component}
            onClick={() => setSelectedComp(prev => (prev?.label === c.label ? null : c))}
            style={{ cursor: 'pointer' }}
            title="Haz clic para ver el linaje del componente"
          >
            <span className={s.componentLabel}>{c.label}</span>
            <span className={s.componentValue}>{formatByUnit(c.value, c.unit)}<ChevronRight size={14} aria-hidden /></span>
          </li>
        ))}
      </ul>
      {selectedComp && (
        <div
          style={{
            marginTop: 8,
            padding: '8px 10px',
            borderRadius: 8,
            background: 'var(--q-navy, #0F2341)',
            color: '#fff',
            fontSize: 12,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span>
            <GitBranch size={12} aria-hidden style={{ marginRight: 4, verticalAlign: 'middle' }} />
            <strong>{selectedComp.label}:</strong> calculado en vista SQL auditada (<code>vGroupKpi</code>).
          </span>
          <Link to="/" style={{ color: '#93C5FD', fontWeight: 600, whiteSpace: 'nowrap' }}>
            Ver cuentas →
          </Link>
        </div>
      )}
      <p className={s.note}>{kpi.note}</p>
    </Card>
  )
}
