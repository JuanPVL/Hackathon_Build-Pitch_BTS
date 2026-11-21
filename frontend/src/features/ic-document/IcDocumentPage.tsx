import { PageHeader, StateMessage, Stack } from '@/shared/ui'

/** Página provisional: la implementa la fase 3. */
export default function IcDocumentPage() {
  return (
    <Stack>
      <PageHeader eyebrow="PASO 2 · TRAZABILIDAD" title="Documento y linaje" />
      <StateMessage kind="empty" title="En construcción" />
    </Stack>
  )
}
