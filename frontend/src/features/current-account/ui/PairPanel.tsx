import { Link, useSearchParams } from 'react-router-dom'
import { X } from 'lucide-react'
import { ButtonLink, Card, Eyebrow, MirrorPair, QueryState } from '@/shared/ui'
import type { QueryLike } from '@/shared/ui'
import { formatMoney } from '@/shared/format/number'
import { resultInfo } from '@/entities/ic'
import { ResultChip } from '@/entities/ic'
import { companyName } from '../domain/companies'
import { documentPath, pairMirror } from '../domain/pair'
import type { PairSelection } from '../domain/pair'
import type { PairDetail } from '../domain/types'
import s from './PairPanel.module.css'

function PairContent({ detail }: { detail: PairDetail }) {
  const [params] = useSearchParams()
  const esc = params.get('esc')
  const docPath = (key: string) => documentPath(key) + (esc ? '?esc=' + encodeURIComponent(esc) : '')
  const mirror = pairMirror(detail)
  const doc = mirror.firstDocument
  const n = detail.documents.length
  return (
    <>
      <p className={s.description}>{detail.description}</p>
      {doc && mirror.firstDocumentAmount ? (
        <div>
          <MirrorPair
            compact
            documentKey={doc.key}
            statusLabel={resultInfo(doc.result).mirrorLabel}
            issuer={{
              label: `${mirror.creditor} · EMITE LA FACTURA`, title: 'Cuenta por cobrar',
              subtitle: `Cliente: ${mirror.debtor}, empresa del grupo`, amount: mirror.firstDocumentAmount,
              note: `Saldo del par ${formatMoney(mirror.creditorUsd, 'USD')}`,
            }}
            receiver={{
              label: `${mirror.debtor} · LA RECIBE`, title: 'Cuenta por pagar espejo',
              subtitle: `Proveedor: ${mirror.creditor}, empresa del grupo`, amount: mirror.firstDocumentAmount,
              note: `Saldo espejo ${formatMoney(mirror.debtorUsd, 'USD')}`,
            }}
          />
        </div>
      ) : <p className={s.description}>El importe pactado y la moneda original no están disponibles en la API.</p>}

      <div className={s.fx}>
        <div>
          <span className={s.fxLabel}>Diferencia cambiaria</span>
          <span className={s.fxText}>Mismo monto en moneda de transacción; la conversión difiere entre las dos empresas.</span>
        </div>
        <strong className={s.fxValue}>{formatMoney(detail.fxDifferenceUsd, 'USD', 2)}</strong>
      </div>

      <h3 className={s.docsTitle}>{n} {n === 1 ? 'documento' : 'documentos'} del par</h3>
      <ul className={s.docs}>
        {detail.documents.map(d => (
          <li key={d.key + (d.statement ?? '')}>
            <Link className={s.docLink} to={docPath(d.key)} aria-label={`Ver documento ${d.key}`}>
              <span className={s.docKey}>{d.key}</span>
              <span className={s.docAmount}>{d.agreed ? formatMoney(d.agreed.amount, d.agreed.currency) : Number.isFinite(d.reportedUsd) ? formatMoney(d.reportedUsd!, 'USD') + ' reportado' : 'Pactado no disponible'}</span>
              <ResultChip result={d.result} />
            </Link>
          </li>
        ))}
      </ul>
      {doc && <ButtonLink variant="onDark" block to={docPath(doc.key)}>Ver documento y linaje</ButtonLink>}
    </>
  )
}

/** Detalle del par seleccionado: las dos patas espejo, la diferencia cambiaria y los documentos. */
export function PairPanel({ pair, query, onClose }: { pair: PairSelection; query: QueryLike<PairDetail>; onClose: () => void }) {
  return (
    <Card tone="navy" className={s.panel} aria-label={`Detalle del par ${pair.company} con ${pair.counterparty}`}>
      <div className={s.top}>
        <Eyebrow onDark>Par seleccionado</Eyebrow>
        <button type="button" className={s.close} onClick={onClose} aria-label="Cerrar detalle del par"><X size={18} aria-hidden /></button>
      </div>
      <h2 className={s.title}>{pair.company} ↔ {pair.counterparty}</h2>
      <p className={s.names}>{companyName(pair.company)} con {companyName(pair.counterparty)}</p>
      <div className={query.data && !query.isError ? undefined : s.stateBox}>
        <QueryState query={query} emptyTitle="Sin detalle del par" emptyText="Todavía no hay documentos entre estas dos empresas.">
          {detail => <PairContent detail={detail} />}
        </QueryState>
      </div>
    </Card>
  )
}

/** Panel vacío: invita a elegir una celda. */
export function PairPlaceholder() {
  return (
    <Card tone="navy" className={s.panel}>
      <Eyebrow onDark>Par seleccionado</Eyebrow>
      <h2 className={s.title}>Elige una celda</h2>
      <p className={s.description}>Selecciona un saldo de la matriz para ver las dos patas del documento, la diferencia cambiaria y la lista de documentos del par.</p>
    </Card>
  )
}
