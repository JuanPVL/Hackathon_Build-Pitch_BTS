import { Callout, PageHeader, QueryState, Split, Stack } from '@/shared/ui'
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
        subtitle="Variaciones calculadas en SQL entre las corridas de origen y destino; el residual muestra cualquier diferencia pendiente."
      />
      <BridgeControls request={request} onFrom={setFrom} onTo={setTo} onMetric={setMetric} />
      <QueryState query={query} emptyTitle="Aún no hay puente" emptyText="Todavía no hay desviaciones calculadas entre estas dos versiones.">
        {bridge => (
          <>
            {bridge.balanced === false && <Callout tone="err" title="El puente no cuadra con los indicadores.">El control del backend detectó una diferencia; revisa los efectos antes de usar este resultado.</Callout>}
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
