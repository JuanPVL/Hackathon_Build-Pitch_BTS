import { PageHeader, StateMessage, Stack } from '@/shared/ui'

/** Página provisional: la implementa la fase 3. */
export default function CurrentAccountPage() {
  return (
    <Stack>
      <PageHeader eyebrow="PASO 2 · CONCILIAR" title="Cuenta corriente entre empresas" />
      <StateMessage kind="empty" title="En construcción" />
    </Stack>
  )
}
