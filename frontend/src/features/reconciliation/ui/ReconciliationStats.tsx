import { Grid, StatCard } from '@/shared/ui'
import { formatAmount } from '@/shared/format/number'
import type { ReconciliationReport } from '../domain/types'

export function ReconciliationStats({ totals }: { totals: ReconciliationReport['totals'] }) {
  const unpaired = totals.documents - totals.reconciled
  return (
    <Grid cols={4}>
      <StatCard
        tone="navy" valueTone="ink" label="Documentos intercompany"
        value={`${formatAmount(totals.reconciled)} de ${formatAmount(totals.documents)}`}
        caption={`Conciliados · ${formatAmount(unpaired)} sin pareja`}
      />
      <StatCard label="Cuadran exacto" value={formatAmount(totals.exact)} valueTone="green" caption="Mismo documento, mismo monto" />
      <StatCard label="Diferencia cambiaria" value={formatAmount(totals.fx)} valueTone="blue" caption="Dentro de tolerancia, a su propia cuenta" />
      <StatCard label="Pendientes" value={formatAmount(totals.pending)} valueTone="ink" caption="Ninguna queda escondida en un ajuste" />
    </Grid>
  )
}
