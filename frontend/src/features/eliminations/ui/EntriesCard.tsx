import { useState } from 'react'
import { Check, CircleAlert, Info } from 'lucide-react'
import { Button, Callout, Card, CardHeader, Chip, ResponsiveTable } from '@/shared/ui'
import type { Column } from '@/shared/ui'
import { formatAmount, formatMoney, formatSigned } from '@/shared/format/number'
import type { EliminationEntry, EliminationReport, EliminationRule, LedgerEntry } from '../domain/types'
import { entryKey, totalLegs, verifyFxIsolated } from '../domain/eliminations'
import type { EliminationView } from '../domain/eliminations'
import s from './EntriesCard.module.css'

function synthesizeEntriesFromLedger(ledger: LedgerEntry[]): EliminationEntry[] {
  const specs: {
    rule: EliminationRule
    concept: string
    accounts: string
    issuerAcc: string
    receiverAcc: string
    targetAccount: EliminationEntry['targetAccount']
  }[] = [
    { rule: 'E1', concept: 'Ventas y costo de ventas IC', accounts: '4200 ↔ 5200', issuerAcc: '4200', receiverAcc: '5200', targetAccount: '7900' },
    { rule: 'E1', concept: 'Servicios de gestión IC', accounts: '4300 ↔ 6200', issuerAcc: '4300', receiverAcc: '6200', targetAccount: '7900' },
    { rule: 'E4', concept: 'Intereses intragrupo', accounts: '7300 ↔ 7200', issuerAcc: '7300', receiverAcc: '7200', targetAccount: '7900' },
    { rule: 'E2', concept: 'Saldos CxC y CxP IC', accounts: '1250 ↔ 2150', issuerAcc: '1250', receiverAcc: '2150', targetAccount: '3900' },
    { rule: 'E3', concept: 'Préstamos intragrupo', accounts: '1600 ↔ 2250', issuerAcc: '1600', receiverAcc: '2250', targetAccount: '3900' },
  ]
  const sumAcc = (acc: string) =>
    ledger.filter(r => r.account === acc).reduce((sum, r) => sum + Math.abs(r.effectUsd), 0)
  return specs
    .map(sp => {
      const issuerAmount = sumAcc(sp.issuerAcc)
      const receiverAmount = sumAcc(sp.receiverAcc)
      return {
        rule: sp.rule,
        concept: sp.concept,
        accounts: sp.accounts,
        issuerAmount,
        receiverAmount,
        difference: issuerAmount - receiverAmount,
        targetAccount: sp.targetAccount,
      }
    })
    .filter(e => e.issuerAmount > 0 || e.receiverAmount > 0)
}

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
  const [showRawLedger, setShowRawLedger] = useState(false)
  const effectiveEntries =
    report.entries.length > 0
      ? report.entries
      : report.ledger
        ? synthesizeEntriesFromLedger(report.ledger)
        : []
  const effectiveReport: EliminationReport = { ...report, entries: effectiveEntries }
  if (report.ledger && (showRawLedger || effectiveEntries.length === 0)) {
    return (
      <LedgerCard
        rows={report.ledger}
        onBackToPairs={effectiveEntries.length > 0 ? () => setShowRawLedger(false) : undefined}
      />
    )
  }
  const ctx: Ctx = { report: effectiveReport, view }
  const rows: Row[] = [...effectiveEntries.map((entry): Row => ({ kind: 'entry', entry })), { kind: 'total' }]
  const fx = verifyFxIsolated(effectiveEntries, effectiveReport.fxIsolated)
  const sum = legs(effectiveReport)
  return (
    <Card className={s.wrap}>
      <CardHeader
        title="Asientos de eliminación · USD"
        aside={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span>{`Generados de ${formatAmount(report.summary.pairs)} pares conciliados`}</span>
            {report.ledger && report.ledger.length > 0 && (
              <Button variant="secondary" onClick={() => setShowRawLedger(true)}>
                Ver {report.ledger.length} líneas contables
              </Button>
            )}
          </div>
        }
      />
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

/** Ledger sin reinterpretar los signos o convertirlo en patas emisora/receptora. */
function LedgerCard({ rows, onBackToPairs }: { rows: LedgerEntry[]; onBackToPairs?: () => void }) {
  const columns: Column<LedgerEntry>[] = [
    { key: 'code', header: 'Asiento / regla', render: row => <span>{row.code} · {row.rule}</span> },
    { key: 'account', header: 'Cuenta', render: row => <span>{row.account} · {row.accountName}</span> },
    { key: 'document', header: 'Documento / empresa', render: row => <span>{row.document ?? '—'} · {row.company ?? 'Grupo'}</span> },
    { key: 'effect', header: 'Efecto USD', numeric: true, render: row => formatSigned(row.effectUsd, 2) },
    { key: 'source', header: 'Referencia', render: row => row.source ?? '—' },
  ]
  return <Card className={s.wrap}>
    <CardHeader
      title="Asientos de eliminación · USD"
      aside={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>{`${rows.length} líneas contables`}</span>
          {onBackToPairs && <Button variant="secondary" onClick={onBackToPairs}>Ver resumen por regla (Antes / Después)</Button>}
        </div>
      }
    />
    <ResponsiveTable caption="Efecto de cada asiento sobre las cuentas del grupo" columns={columns} rows={rows}
      rowKey={row => row.id}
      renderCard={row => <article className={s.card}><strong>{row.code} · {row.rule}</strong><p>{row.account} · {row.accountName}</p><p>{row.document ?? 'Sin documento'} · {row.company ?? 'Grupo'}</p><strong>{formatSigned(row.effectUsd, 2)} USD</strong><p>{row.source}</p></article>} />
    <p className={s.footnote}>Efectos firmados devueltos por el backend. Las patas originales del documento no forman parte de este reporte.</p>
  </Card>
}
