import { Link, useParams } from 'react-router-dom'
import { Chip, PageHeader, QueryState, Stack } from '@/shared/ui'
import { ResultChip } from '@/entities/ic'
import { documentTitle, resultSummary } from './domain/document'
import { useIcDocument } from './hooks/useIcDocument'
import { Breadcrumbs } from './ui/Breadcrumbs'
import { DocumentMirror } from './ui/DocumentMirror'
import { EventsCard } from './ui/EventsCard'
import { LifecycleCard } from './ui/LifecycleCard'
import { LineageChain } from './ui/LineageChain'
import type { IcDocumentDetail } from './domain/types'
import s from './IcDocumentPage.module.css'

function DocumentView({ doc }: { doc: IcDocumentDetail }) {
  return (
    <Stack>
      <Breadcrumbs doc={doc} />
      <PageHeader
        eyebrow="PASO 2 · CONCILIAR · TRAZABILIDAD"
        title={documentTitle(doc)}
        subtitle="Cada saldo llega a su factura, y cada factura a la fila del archivo que la originó."
        meta={
          <div className={s.chips}>
            <ResultChip result={doc.result} label={resultSummary(doc.result)} />
            <Chip tone="neutral">Versión {doc.version}</Chip>
          </div>
        }
      />
      <DocumentMirror doc={doc} />
      <LineageChain nodes={doc.lineage} ok={doc.lineageOk} />
      <div className={s.bottom}>
        <LifecycleCard doc={doc} />
        <EventsCard events={doc.events} />
      </div>
    </Stack>
  )
}

export default function IcDocumentPage() {
  const { key } = useParams<{ key: string }>()
  const query = useIcDocument(key)

  if (query.data) return <DocumentView doc={query.data} />

  // Cargando, sin permiso, error o llave inexistente: la página conserva su h1.
  return (
    <Stack>
      <PageHeader eyebrow="PASO 2 · CONCILIAR · TRAZABILIDAD" title="Documento y linaje" subtitle={key ? `Llave ${key}` : undefined} />
      <QueryState
        query={query}
        emptyTitle="No encontramos este documento"
        emptyText={<>La llave {key ? `“${key}” ` : ''}no existe en este escenario. <Link to="/cuenta-corriente">Volver a Cuenta corriente</Link></>}
      >
        {() => null}
      </QueryState>
    </Stack>
  )
}
