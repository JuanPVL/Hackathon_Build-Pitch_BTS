import { PageHeader, StateMessage, Stack } from '@/shared/ui'

/** Página provisional: la implementa la fase 3. */
export default function ReconciliationPage() {
  return (
    <Stack>
      <PageHeader eyebrow="PASO 2 · CONCILIAR" title="Cada venta entre empresas nace en pareja" />
      <StateMessage kind="empty" title="En construcción" />
    </Stack>
  )
}
