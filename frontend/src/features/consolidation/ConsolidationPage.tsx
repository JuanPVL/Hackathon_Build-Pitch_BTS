import { ConsolidateControl } from '@/features/backend/ConsolidateControl'
import { Download, GitCompareArrows } from 'lucide-react'
import { Button, ButtonLink, PageHeader, Pipeline, QueryState, Split, Stack } from '@/shared/ui'
import { useConsolidation } from './hooks/useConsolidation'
import { toPipelineSteps } from './domain/consolidation'
import { SalesEquationCard } from './ui/SalesEquationCard'
import { KpiGrid } from './ui/KpiGrid'
import { IncomeStatementCard } from './ui/IncomeStatementCard'
import { EvaByCompanyCard } from './ui/EvaByCompanyCard'
import { RunMeta } from './ui/RunMeta'

export default function ConsolidationPage() {
  const query = useConsolidation()
  const { scenario } = query
  return (
    <Stack>
      <PageHeader
        eyebrow={`INICIO · PRESUPUESTO 2027 · ${scenario.short}`}
        title="Consolidado del grupo"
        meta={query.data && <RunMeta runId={query.data.runId} generatedAt={query.data.generatedAt} />}
        actions={
          <>
            <ConsolidateControl />
            <ButtonLink icon={GitCompareArrows} to="/desviaciones">Comparar con V1</ButtonLink>
            <Button icon={Download} disabled title="Próximamente">Exportar</Button>
          </>
        }
      />
      <QueryState query={query} emptyTitle="Aún no hay consolidado" emptyText="Todavía no se ha ejecutado una corrida para este escenario.">
        {summary => (
          <>
            {summary.steps.length > 0 && <Pipeline steps={toPipelineSteps(summary.steps)} />}
            <SalesEquationCard summary={summary} />
            <KpiGrid kpis={summary.kpis} />
            <Split aside={380}>
              <IncomeStatementCard summary={summary} />
              <EvaByCompanyCard rows={summary.evaByCompany} />
            </Split>
          </>
        )}
      </QueryState>
    </Stack>
  )
}
