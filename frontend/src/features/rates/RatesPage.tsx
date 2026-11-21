import { PageHeader, StateMessage, Stack } from '@/shared/ui'

/** Página provisional: la implementa la fase 3. */
export default function RatesPage() {
  return (
    <Stack>
      <PageHeader eyebrow="PASO 3 · CONVERTIR" title="Una sola tabla de tasas para todo el grupo" />
      <StateMessage kind="empty" title="En construcción" />
    </Stack>
  )
}
