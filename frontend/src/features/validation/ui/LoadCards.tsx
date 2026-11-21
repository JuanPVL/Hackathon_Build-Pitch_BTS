import type { LoadSummary } from '../domain/types'
import { Card, CardHeader, Chip } from '@/shared/ui'
import { loadStatusLabel, loadStatusTone, pluralFindings } from '../domain/validation'
import s from './LoadCards.module.css'

const ownerLabel = (owner: string) => (owner === 'TASAS' ? 'Tasas' : owner)

function StatusChip({ status }: { status: LoadSummary['budget'] }) {
  return <Chip tone={loadStatusTone(status)}>{loadStatusLabel(status)}</Chip>
}

/** Una tarjeta por carga (empresa o tabla de tasas). 7 en escritorio ancho, 4+3 en tableta. */
function LoadGrid({ loads }: { loads: LoadSummary[] }) {
  return (
    <ul className={s.grid} aria-label="Cargas por empresa">
      {loads.map(load => (
        <li key={load.owner} className={s.card}>
          <div className={s.cardHead}>
            <h3 className={s.owner}>{load.owner}</h3>
            <span className={s.currency}>{load.currency}</span>
          </div>
          <div className={s.line}><span className={s.lineLabel}>{load.owner === 'TASAS' ? 'Tabla' : 'Ppto.'}</span><StatusChip status={load.budget} /></div>
          {load.owner !== 'TASAS' && <div className={s.line}><span className={s.lineLabel}>Bal.</span><StatusChip status={load.balance} /></div>}
          <span className={load.findings > 0 ? s.count : s.countOk}>{pluralFindings(load.findings)}</span>
        </li>
      ))}
    </ul>
  )
}

/** Móvil: una sola tarjeta con una fila por carga. */
function LoadList({ loads }: { loads: LoadSummary[] }) {
  return (
    <Card outlined compact>
      <CardHeader title="Cargas recibidas" />
      <ul className={s.list} aria-label="Cargas por empresa">
        {loads.map(load => (
          <li key={load.owner} className={s.row}>
            <span className={s.rowOwner}>{ownerLabel(load.owner)}</span>
            <StatusChip status={load.budget ?? load.balance} />
            <span className={load.findings > 0 ? s.count : s.countOk}>{pluralFindings(load.findings)}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

export function LoadCards({ loads, mobile }: { loads: LoadSummary[]; mobile: boolean }) {
  return mobile ? <LoadList loads={loads} /> : <LoadGrid loads={loads} />
}
