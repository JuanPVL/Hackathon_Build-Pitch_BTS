import { TrendingDown, TrendingUp, Check, FileClock } from 'lucide-react'
import { Card, CardHeader, Chip, ResponsiveTable } from '@/shared/ui'
import type { Column } from '@/shared/ui'
import { formatRate } from '@/shared/format/number'
import type { RateRow, RatesTable } from '../domain/types'
import { currencyDescription, formatVariation, rateVariation, statusLabel, usdPerUnit, variationDirection } from '../domain/rates'
import s from './RatesTableCard.module.css'

function VariationChip({ row, label }: { row: RateRow; label?: string }) {
  const ratio = rateVariation(row)
  if (ratio === null) return null
  const up = variationDirection(ratio) === 'up'
  return (
    <Chip tone="warn" icon={up ? TrendingUp : TrendingDown}>
      <span className="q-sr-only">{up ? 'Sube ' : 'Baja '}</span>{formatVariation(ratio)}{label && ` ${label}`}
    </Chip>
  )
}

/** Tasa en unidades por 1 USD y, debajo, la tasa a USD que guarda cada cifra convertida. */
function RateCell({ units, usd, accent }: { units: number | null; usd?: number; accent?: boolean }) {
  if (units === null) return <span className={s.empty} aria-label="Sin dato">—</span>
  return (
    <span className={s.cell}>
      <span className={`${s.rate} ${accent ? s.accent : ''}`}>{formatRate(units)}</span>
      <span className={s.usd}>{formatRate(usd ?? usdPerUnit(units), 6)} USD</span>
    </span>
  )
}

function buildColumns(version: string): Column<RateRow>[] {
  return [
    { key: 'currency', header: 'Moneda', render: r => <strong className={s.code}>{r.currency}</strong>, width: 90 },
    { key: 'companies', header: 'Empresas', hideBelow: 'lg', render: r => <span className={s.desc}>{currencyDescription(r)}</span> },
    { key: 'previous', header: 'Presupuesto anterior', align: 'right', render: r => <RateCell units={r.budgetPrevious} /> },
    {
      key: 'budget', header: `Presupuesto ${version}`, align: 'right',
      render: r => (
        <span className={s.budgetCell}>
          <VariationChip row={r} />
          <RateCell units={r.budget} usd={r.budgetToUsd} accent />
        </span>
      ),
    },
    { key: 'closing', header: `Cierre ${version}`, align: 'right', render: r => <RateCell units={r.closing} /> },
    { key: 'historical', header: 'Histórica', align: 'right', render: r => <RateCell units={r.historical} /> },
  ]
}

function RateMobileCard({ row, version }: { row: RateRow; version: string }) {
  const minis: { label: string; units: number | null; highlight?: boolean }[] = [
    { label: 'Ppto. ant.', units: row.budgetPrevious },
    { label: `Ppto. ${version}`, units: row.budget, highlight: true },
    { label: 'Cierre', units: row.closing },
    { label: 'Histórica', units: row.historical },
  ]
  return (
    <article className={s.mobileCard}>
      <div className={s.mobileHead}>
        <h3 className={s.mobileCode}>{row.currency}</h3>
        <VariationChip row={row} label="vs. anterior" />
      </div>
      <p className={s.mobileDesc}>{currencyDescription(row)}</p>
      <dl className={s.minis}>
        {minis.map(m => (
          <div key={m.label} className={`${s.mini} ${m.highlight ? s.miniHighlight : ''}`}>
            <dt>{m.label}</dt>
            <dd>{m.units === null ? '—' : formatRate(m.units)}</dd>
          </div>
        ))}
      </dl>
    </article>
  )
}

export function RatesTableCard({ table }: { table: RatesTable }) {
  const columns = buildColumns(table.version)
  const StatusIcon = table.status === 'VIGENTE' ? Check : FileClock
  return (
    <Card className={s.tableCard}>
      <CardHeader
        title="Tasas oficiales · unidades por 1 USD"
        aside={<Chip tone={table.status === 'VIGENTE' ? 'ok' : 'warn'} icon={StatusIcon}>{statusLabel(table.status)} {table.version} · aplicada a las {table.appliedTo} empresas</Chip>}
      />
      <ResponsiveTable
        caption="Tasas oficiales del grupo por moneda"
        columns={columns}
        rows={table.rows}
        rowKey={r => r.currency}
        renderCard={r => <RateMobileCard row={r} version={table.version} />}
      />
    </Card>
  )
}
