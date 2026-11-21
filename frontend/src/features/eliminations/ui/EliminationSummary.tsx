import { Grid, StatCard } from '@/shared/ui'
import { formatAmount, formatSigned } from '@/shared/format/number'
import type { EliminationReport } from '../domain/types'

/** Cuatro cifras de cabecera: lo eliminado en resultados y balance, lo pendiente y el efecto en el EBIT. */
export function EliminationSummary({ summary }: { summary: EliminationReport['summary'] }) {
  return (
    <Grid cols={4}>
      <StatCard label="Eliminado en resultados" value={formatAmount(summary.pnl)} valueTone="orange" caption="Ventas, servicios e intereses IC" />
      <StatCard label="Eliminado en balance" value={formatAmount(summary.balance)} valueTone="orange" caption="Préstamo y saldos CxC/CxP IC" />
      <StatCard
        label="Pendiente sin eliminar"
        value={formatAmount(summary.pending)}
        valueTone={summary.pending > 0 ? 'red' : 'ink'}
        caption={summary.pending > 0 ? 'Intercompany fuera de conciliación: no se elimina a la fuerza' : 'Ningún par fuera de conciliación'}
      />
      <StatCard
        tone="navy" label="Efecto en el EBIT" value={formatSigned(summary.ebitEffect)} valueTone="blue"
        caption={`Ingresos IC ${formatAmount(summary.icIncome)} vs gastos ${formatAmount(summary.icExpense)}`}
      />
    </Grid>
  )
}
