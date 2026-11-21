import { PageHeader, StateMessage, Stack } from '@/shared/ui'

/** Página provisional: la implementa la fase 3. */
export default function ConsolidationPage() {
  return (
    <Stack>
      <PageHeader eyebrow="INICIO · PRESUPUESTO 2027" title="Consolidado del grupo" />
      <StateMessage kind="empty" title="En construcción" />
    </Stack>
  )
}
