import { Check, CircleAlert, Info } from 'lucide-react'
import { Callout, Card, CardHeader, Chip, ResponsiveTable } from '@/shared/ui'
import type { Column } from '@/shared/ui'
import { formatAmount, formatMoney, formatSigned } from '@/shared/format/number'
import type { EliminationEntry, EliminationReport } from '../domain/types'
import { entryKey, totalLegs, verifyFxIsolated } from '../domain/eliminations'
import type { EliminationView } from '../domain/eliminations'
import s from './EntriesCard.module.css'

type Row = { kind: 'entry'; entry: EliminationEntry } | { kind: 'total' }

interface Ctx { report: EliminationReport; view: EliminationView }

const legs = (report: EliminationReport) => totalLegs(report.entries)
const fxText = (report: EliminationReport) => `${formatSigned(report.fxIsolated.pnl)} P&L · ${formatSigned(report.fxIsolated.cta)} CTA`

function buildColumns({ report, view }: Ctx): Column<Row>[] {
  const before = view === 'antes'
  const legClass = before ? s.legBoxed : s.leg
  const columns: Column<Row>[] = [
    { key: 'rule', header: 'Regla', width: 70, render: r => (r.kind === 'entry' ? <Chip square tone="neutral">{r.entry.rule}</Chip> : null) },
    {
      key: 'concept', header: 'Concepto',
      render: r => r.kind === 'entry'
        ? <div className={s.concept}><strong>{r.entry.concept}</strong><span>Cuentas {r.entry.accounts}</span></div>
        : <strong>{before ? 'Suma de ambas patas' : 'Diferencia cambiaria aislada'}</strong>,
    },
    {
      key: 'issuer', header: 'Pata emisora', numeric: true,
      render: r => <span className={legClass}>{r.kind === 'entry' ? formatAmount(r.entry.issuerAmount) : before ? formatAmount(legs(report).issuer) : ''}</span>,
    },
    {
      key: 'receiver', header: 'Pata receptora', numeric: true,
      render: r => <span className={legClass}>{r.kind === 'entry' ? formatAmount(r.entry.receiverAmount) : before ? formatAmount(legs(report).receiver) : ''}</span>,
    },
  ]
  if (!before) {
    columns.push({
      key: 'difference', header: 'Diferencia → cuenta', numeric: true,
      render: r => r.kind === 'entry'
        ? <span className={s.diff}>{formatSigned(r.entry.difference)} → {r.entry.targetAccount}</span>
        : <span className={s.diff}>{fxText(report)}</span>,
    })
  }
  return columns
}

function EntryMobileCard({ row, ctx }: { row: Row; ctx: Ctx }) {
  const before = ctx.view === 'antes'
  if (row.kind === 'total') {
    return (
      <article className={`${s.card} ${s.cardTotal}`}>
        <strong>{before ? 'Suma de ambas patas' : 'Diferencia cambiaria aislada'}</strong>
        {before
          ? <div className={s.legs}><div className={s.legBox}><span>Emisoras</span><strong>{formatAmount(legs(ctx.report).issuer)}</strong></div><div className={s.legBox}><span>Receptoras</span><strong>{formatAmount(legs(ctx.report).receiver)}</strong></div></div>
          : <span className={s.diff}>{fxText(ctx.report)}</span>}
      </article>
    )
  }
  const e = row.entry
  return (
    <article className={s.card}>
      <header className={s.cardHead}>
        <Chip square tone="neutral">{e.rule}</Chip>
        <div className={s.concept}><strong>{e.concept}</strong><span>Cuentas {e.accounts}</span></div>
      </header>
      <div className={s.legs}>
        <div className={`${s.legBox} ${before ? s.legBoxStrong : ''}`}><span>Emisora</span><strong>{formatAmount(e.issuerAmount)}</strong></div>
        <div className={`${s.legBox} ${before ? s.legBoxStrong : ''}`}><span>Receptora</span><strong>{formatAmount(e.receiverAmount)}</strong></div>
      </div>
      {!before && (
        <div className={s.cardFoot}>
          <span>Diferencia → cuenta</span>
          <span className={s.diff}>{formatSigned(e.difference)} → {e.targetAccount}</span>
        </div>
      )}
    </article>
  )
}

/** Asientos de eliminación. "Después" muestra la diferencia de cada par; "Antes" muestra las patas que se sumarían. */
export function EntriesCard({ report, view }: Ctx) {
  const ctx: Ctx = { report, view }
  const rows: Row[] = [...report.entries.map((entry): Row => ({ kind: 'entry', entry })), { kind: 'total' }]
  const fx = verifyFxIsolated(report.entries, report.fxIsolated)
  const sum = legs(report)
  return (
    <Card className={s.wrap}>
      <CardHeader title="Asientos de eliminación · USD" aside={`Generados de ${formatAmount(report.summary.pairs)} pares conciliados`} />
      {view === 'antes' && (
        <div className={s.notice}>
          <Callout tone="info" icon={Info} title="Sin eliminar, el grupo suma las dos patas de cada par.">
            {formatMoney(sum.issuer, 'USD')} de las emisoras más {formatMoney(sum.receiver, 'USD')} de las receptoras: {formatMoney(sum.total, 'USD')} contados dos veces.
          </Callout>
        </div>
      )}
      <ResponsiveTable
        caption={view === 'antes' ? 'Patas emisora y receptora de cada par, sin eliminar' : 'Asientos de eliminación con su diferencia y cuenta destino'}
        columns={buildColumns(ctx)}
        rows={rows}
        rowKey={r => (r.kind === 'entry' ? entryKey(r.entry) : 'total')}
        rowVariant={r => (r.kind === 'total' ? 'total' : undefined)}
        renderCard={r => <EntryMobileCard row={r} ctx={ctx} />}
      />
      {view === 'despues' && (
        <div className={s.verify}>
          {fx.ok
            ? <Chip tone="ok" icon={Check}>Las diferencias cuadran con lo aislado</Chip>
            : <Callout tone="err" icon={CircleAlert} title="Las diferencias no cuadran con lo aislado.">Revisa los asientos antes de publicar: la suma por cuenta no coincide con la diferencia cambiaria aislada.</Callout>}
        </div>
      )}
      <p className={s.footnote}>La eliminación se calcula sobre la pata emisora y se verifica contra la receptora. La diferencia nunca se fuerza a cero: va a su cuenta.</p>
    </Card>
  )
}
