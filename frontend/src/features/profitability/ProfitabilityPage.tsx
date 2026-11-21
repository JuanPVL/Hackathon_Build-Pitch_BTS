import { Info } from 'lucide-react'
import { Callout, Chip, Grid, PageHeader, QueryState, SegmentedControl, Split, Stack } from '@/shared/ui'
import { useProfitability, useProfitabilityView } from './hooks/useProfitability'
import type { ProfitabilityView } from './domain/types'
import { KpiCard } from './ui/KpiCard'
import { CompanyTable } from './ui/CompanyTable'
import { ComparisonCard } from './ui/ComparisonCard'

const VIEW_OPTIONS: { value: ProfitabilityView; label: string }[] = [
  { value: 'consolidado', label: 'Con eliminación IC' },
  { value: 'sin-eliminar', label: 'Sin eliminar' },
]

export default function ProfitabilityPage() {
  const [view, setView] = useProfitabilityView()
  const query = useProfitability(view)
  return (
    <Stack>
      <PageHeader
        eyebrow="PASO 5 · EXPLICAR · RENTABILIDAD"
        title="ROIC, ROCE y EVA se calculan, no se copian"
        subtitle="Cada indicador muestra su fórmula y sus componentes; cada componente abrirá su linaje hasta la fila del archivo."
        actions={<SegmentedControl<ProfitabilityView> label="Vista de eliminación intercompany" options={VIEW_OPTIONS} value={view} onChange={setView} />}
      />
      <QueryState query={query} emptyTitle="Aún no hay rentabilidad" emptyText="Todavía no hay ROIC, ROCE ni EVA calculados para este escenario.">
        {report => (
          <>
            <Grid cols={3}>
              {report.kpis.map(k => <KpiCard key={k.code} kpi={k} />)}
            </Grid>
            <Split aside={420}>
              <CompanyTable rows={report.byCompany} wacc={report.wacc} />
              <Stack>
                <ComparisonCard
                  title="Mismo dato, otra decisión"
                  conceptHeader="Concepto" leftHeader="Sin eliminar" rightHeader="Eliminado"
                  rows={report.eliminationComparison}
                />
                <ComparisonCard
                  title="Indicadores que se frenan"
                  aside={<Chip tone="err">Sin validar</Chip>}
                  conceptHeader="Indicador" leftHeader="Sin validar" rightHeader="Validado"
                  rows={report.unvalidatedComparison}
                  leftNegative
                />
              </Stack>
            </Split>
            <Callout tone="info" icon={Info}>
              EBIT = utilidad operativa: ventas − costo de ventas − gastos operativos, antes de intereses e impuestos.
              No es EBITDA, que además suma de vuelta la depreciación y la amortización.
            </Callout>
          </>
        )}
      </QueryState>
    </Stack>
  )
}
