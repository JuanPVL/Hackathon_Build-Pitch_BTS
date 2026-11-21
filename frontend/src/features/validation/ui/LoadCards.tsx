import type { LoadSummary } from '../domain/types'
import { Card, CardHeader, Chip } from '@/shared/ui'
import { loadStatusLabel, loadStatusTone, pluralFindings } from '../domain/validation'
import s from './LoadCards.module.css'

const ownerLabel = (owner: string) => (owner === 'TASAS' ? 'Tasas' : owner)

function StatusChip({ status }: { status: LoadSummary['budget'] }) {
  return <Chip tone={loadStatusTone(status)}>{loadStatusLabel(status)}</Chip>
}

/** Una tarjeta por carga (empresa o tabla de tasas). 7 en escritorio ancho, 4+3 en tableta. */
function LoadGrid({ loads, selectedOwner, onSelectOwner }: { loads: LoadSummary[]; selectedOwner?: string | null; onSelectOwner?: (owner: string) => void }) {
  return (
    <ul className={s.grid} aria-label="Cargas por empresa">
      {loads.map(load => {
        const active = selectedOwner === load.owner
        return (
          <li
            key={load.owner}
            className={s.card}
            onClick={onSelectOwner ? () => onSelectOwner(load.owner) : undefined}
            style={onSelectOwner ? {
              cursor: 'pointer',
              outline: active ? '2px solid var(--q-blue, #2563EB)' : undefined,
              background: active ? 'var(--q-surface-alt, #EFF6FF)' : undefined,
            } : undefined}
            title={onSelectOwner ? `Filtrar por ${load.owner}` : undefined}
          >
            <div className={s.cardHead}>
              <h3 className={s.owner}>{load.owner}</h3>
              <span className={s.currency}>{load.currency}</span>
            </div>
            <div className={s.line}><span className={s.lineLabel}>{load.owner === 'TASAS' ? 'Tabla' : 'Ppto.'}</span><StatusChip status={load.budget} /></div>
            {load.owner !== 'TASAS' && <div className={s.line}><span className={s.lineLabel}>Bal.</span><StatusChip status={load.balance} /></div>}
            <span className={load.findings > 0 ? s.count : s.countOk}>{pluralFindings(load.findings)}</span>
          </li>
        )
      })}
    </ul>
  )
}

/** Móvil: una sola tarjeta con una fila por carga. */
function LoadList({ loads, selectedOwner, onSelectOwner }: { loads: LoadSummary[]; selectedOwner?: string | null; onSelectOwner?: (owner: string) => void }) {
  return (
    <Card outlined compact>
      <CardHeader title="Cargas recibidas" />
      <ul className={s.list} aria-label="Cargas por empresa">
        {loads.map(load => (
          <li
            key={load.owner}
            className={s.row}
            onClick={onSelectOwner ? () => onSelectOwner(load.owner) : undefined}
            style={onSelectOwner ? { cursor: 'pointer', fontWeight: selectedOwner === load.owner ? 700 : undefined } : undefined}
          >
            <span className={s.rowOwner}>{ownerLabel(load.owner)}</span>
            <StatusChip status={load.budget ?? load.balance} />
            <span className={load.findings > 0 ? s.count : s.countOk}>{pluralFindings(load.findings)}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

export function LoadCards({ loads, mobile, selectedOwner, onSelectOwner }: { loads: LoadSummary[]; mobile: boolean; selectedOwner?: string | null; onSelectOwner?: (owner: string) => void }) {
  return mobile
    ? <LoadList loads={loads} selectedOwner={selectedOwner} onSelectOwner={onSelectOwner} />
    : <LoadGrid loads={loads} selectedOwner={selectedOwner} onSelectOwner={onSelectOwner} />
}
