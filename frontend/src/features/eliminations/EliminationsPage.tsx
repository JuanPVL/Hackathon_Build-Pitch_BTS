import { PageHeader, StateMessage, Stack } from '@/shared/ui'

/** Página provisional: la implementa la fase 3. */
export default function EliminationsPage() {
  return (
    <Stack>
      <PageHeader eyebrow="PASO 4 · ELIMINAR" title="Lo que el grupo se vende a sí mismo se elimina solo" />
      <StateMessage kind="empty" title="En construcción" />
    </Stack>
  )
}
