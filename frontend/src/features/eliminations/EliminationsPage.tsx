import { PageHeader, QueryState, SegmentedControl, Split, Stack } from '@/shared/ui'
import type { SegmentOption } from '@/shared/ui'
import type { EliminationView } from './domain/eliminations'
import { useEliminationReport } from './hooks/useEliminationReport'
import { useEliminationView } from './hooks/useEliminationView'
import { CapitalPanel } from './ui/CapitalPanel'
import { EliminationSummary } from './ui/EliminationSummary'
import { EntriesCard } from './ui/EntriesCard'

const VIEW_OPTIONS: SegmentOption<EliminationView>[] = [
  { value: 'antes', label: 'Antes' },
  { value: 'despues', label: 'Después' },
]

export default function EliminationsPage() {
  const query = useEliminationReport()
  const [view, setView] = useEliminationView()
  const run = query.data ? ` · CORRIDA ${query.data.runId}` : ''
  return (
    <Stack>
      <PageHeader
        eyebrow={`PASO 4 · ELIMINAR${run}`}
        title="Lo que el grupo se vende a sí mismo se elimina solo"
        subtitle="Los asientos salen de los pares conciliados; nadie los captura. Lo que no concilia no se elimina a la fuerza: queda visible como intercompany pendiente."
        actions={!query.data?.ledger && <SegmentedControl label="Vista de eliminaciones" options={VIEW_OPTIONS} value={view} onChange={setView} />}
      />
      <QueryState query={query} emptyTitle="Sin eliminaciones" emptyText="El servicio todavía no expone los asientos de eliminación de este escenario.">
        {report => (
          <>
            <EliminationSummary summary={report.summary} ledgerMode={!!report.ledger} />
            <Split aside={380}>
              <EntriesCard report={report} view={view} />
              <CapitalPanel capital={report.capital} />
            </Split>
          </>
        )}
      </QueryState>
    </Stack>
  )
}
