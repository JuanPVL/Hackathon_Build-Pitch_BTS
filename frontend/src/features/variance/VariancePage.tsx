import { PageHeader, QueryState, Split, Stack } from '@/shared/ui'
import { useBridgeRequest, useVarianceBridge } from './hooks/useVariance'
import { metricTitle } from './domain/bridge'
import { BridgeControls } from './ui/BridgeControls'
import { BridgeCard } from './ui/BridgeCard'
import { NarrativeCard } from './ui/NarrativeCard'
import { EffectsTableCard } from './ui/EffectsTableCard'
import { CompanyCausesCard } from './ui/CompanyCausesCard'
import { EvaBridgeCard } from './ui/EvaBridgeCard'

export default function VariancePage() {
  const { request, setFrom, setTo, setMetric } = useBridgeRequest()
  const query = useVarianceBridge(request)
  return (
    <Stack>
      <PageHeader
        eyebrow="PASO 5 · EXPLICAR · DESVIACIONES"
        title={metricTitle(request.metric)}
        subtitle="Los efectos suman exacto la diferencia. Los calcula SQL; la IA solo los redacta."
      />
      <BridgeControls request={request} onFrom={setFrom} onTo={setTo} onMetric={setMetric} />
      <QueryState query={query} emptyTitle="Aún no hay puente" emptyText="Todavía no hay desviaciones calculadas entre estas dos versiones.">
        {bridge => (
          <>
            <Split aside={400}>
              <BridgeCard bridge={bridge} />
              {bridge.narrative ? <NarrativeCard narrative={bridge.narrative} /> : <EffectsTableCard effects={bridge.effects} />}
            </Split>
            <Split aside={400}>
              <CompanyCausesCard rows={bridge.byCompany} />
              <EvaBridgeCard eva={bridge.eva} fromLabel={bridge.from.label} toLabel={bridge.to.label} />
            </Split>
          </>
        )}
      </QueryState>
    </Stack>
  )
}
