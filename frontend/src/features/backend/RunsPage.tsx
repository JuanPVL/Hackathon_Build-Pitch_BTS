import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { CalendarClock, Check, History, Lock, TriangleAlert } from 'lucide-react'
import { ConsolidateControl } from './ConsolidateControl'
import { useBackend } from '@/shared/api/useBackend'
import type { RunDto } from '@/shared/api/backend'
import { formatRunDate } from '@/features/consolidation/domain/runInfo'
import { ButtonLink, Card, CardHeader, Chip, DataTable, PageHeader, QueryState, Stack } from '@/shared/ui'
import type { Column } from '@/shared/ui'

export default function RunsPage() {
  const backend = useBackend()
  const query = useQuery({
    queryKey: ['runs'],
    queryFn: ({ signal }) => backend.runs(signal),
  })

  const columns: Column<RunDto>[] = [
    {
      key: 'runId',
      header: 'Corrida',
      render: (r) => (
        <Link to={`/corridas/${r.runId}`}>
          <code>{r.runId}</code>
        </Link>
      ),
    },
    {
      key: 'scenarioId',
      header: 'Escenario',
      render: (r) => <Chip tone="brand">{r.scenarioId}</Chip>,
    },
    {
      key: 'executedAt',
      header: 'Ejecutada',
      render: (r) => (
        <span>
          <CalendarClock size={14} aria-hidden style={{ verticalAlign: 'middle', marginRight: 6 }} />
          {formatRunDate(r.executedAt)}
        </span>
      ),
    },
    {
      key: 'lineageOk',
      header: 'Linaje',
      render: (r) =>
        r.lineageOk === false ? (
          <Chip tone="err" icon={TriangleAlert}>Descuadre</Chip>
        ) : (
          <Chip tone="ok" icon={Check}>Verificado (Σ = consolidado)</Chip>
        ),
    },
    {
      key: 'ratesHash',
      header: 'Hash de tasas',
      hideBelow: 'lg',
      render: (r) => <code>{r.ratesHash ? r.ratesHash.slice(0, 12) + '…' : 'SHA-256 · Oficial'}</code>,
    },
    {
      key: 'actions',
      header: 'Detalle',
      align: 'right',
      render: (r) => (
        <ButtonLink to={`/corridas/${r.runId}`} variant="secondary">
          Ver corrida
        </ButtonLink>
      ),
    },
  ]

  return (
    <Stack>
      <PageHeader
        eyebrow="INICIO · CONSOLIDACIÓN INMUTABLE"
        title="Corridas de consolidación"
        subtitle="Cada ejecución del motor genera una foto inmutable con parámetros congelados, huella de tasas y verificación de linaje."
        actions={<ConsolidateControl />}
      />
      <Card>
        <CardHeader
          title="Historial de corridas"
          aside={<Chip tone="info" icon={History}>{query.data?.length ?? 0} corridas</Chip>}
        />
        <QueryState
          query={query}
          isEmpty={(rows) => rows.length === 0}
          emptyTitle="Sin corridas registradas"
          emptyText="Todavía no se ha ejecutado ninguna consolidación."
        >
          {(rows) => (
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(r) => r.runId}
              caption="Historial de corridas de consolidación inmutables"
            />
          )}
        </QueryState>
        <p style={{ marginTop: 12, fontSize: 13, color: 'var(--q-gray-text)' }}>
          <Lock size={13} aria-hidden style={{ verticalAlign: 'middle', marginRight: 6 }} />
          Las corridas son de solo lectura: aprobar o corregir una carga nueva nunca reescribe una corrida histórica.
        </p>
      </Card>
    </Stack>
  )
}
