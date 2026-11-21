import { PageHeader, StateMessage, Stack } from '@/shared/ui'

/** Página provisional: la implementa la fase 3. */
export default function ValidationPage() {
  return (
    <Stack>
      <PageHeader eyebrow="PASO 1 · VALIDAR" title="Carga y validación" />
      <StateMessage kind="empty" title="En construcción" />
    </Stack>
  )
}
