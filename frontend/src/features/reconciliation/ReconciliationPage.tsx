import { PageHeader, QueryState, SegmentedControl, Split, Stack, StateMessage } from '@/shared/ui'
import { TYPE_FILTER_OPTIONS } from './domain/filters'
import { useReconciliation } from './hooks/useReconciliation'
import { useTypeFilter } from './hooks/useTypeFilter'
import { ReconciliationStats } from './ui/ReconciliationStats'
import { PairsTable } from './ui/PairsTable'
import { DifferencePanel } from './ui/DifferencePanel'

export default function ReconciliationPage() {
  const filter = useTypeFilter()
  const query = useReconciliation(filter.type)

  return (
    <Stack>
      <PageHeader
        eyebrow="PASO 2 · CONCILIAR"
        title="Cada venta entre empresas nace en pareja"
        subtitle="Se concilia por la llave del documento, no por monto ni por texto. Cada diferencia tiene nombre y una acción del sistema."
        actions={query.data?.typeFilterAvailable === false ? undefined : <SegmentedControl label="Filtrar por tipo de documento" options={TYPE_FILTER_OPTIONS} value={filter.value} onChange={filter.setValue} />}
      />
      <QueryState query={query} emptyTitle="Sin conciliación disponible" emptyText="Todavía no hay documentos intercompany para este escenario.">
        {report => (
          <>
            <ReconciliationStats totals={report.totals} />
            <Split aside={360}>
              {report.pairs.length === 0
                ? <StateMessage kind="empty" title="Sin documentos para este filtro">Prueba con otro tipo de documento.</StateMessage>
                : <PairsTable report={report} />}
              <DifferencePanel byResult={report.byResult} />
            </Split>
          </>
        )}
      </QueryState>
    </Stack>
  )
}
