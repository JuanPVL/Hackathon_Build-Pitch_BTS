import { History, Send } from 'lucide-react'
import { Button, PageHeader, QueryState, Stack } from '@/shared/ui'
import { useRatesTable } from './hooks/useRatesTable'
import { ConversionRulesCard, RateControlsCard } from './ui/RateInsights'
import { RatesTableCard } from './ui/RatesTableCard'
import s from './RatesPage.module.css'

export default function RatesPage() {
  const query = useRatesTable()
  return (
    <Stack>
      <PageHeader
        eyebrow="PASO 3 · CONVERTIR"
        title="Una sola tabla de tasas para todo el grupo"
        subtitle="Cada país presupuesta en su moneda; el grupo convierte con una tabla única y versionada. Cada cifra convertida guarda la tasa que usó."
        actions={
          <>
            <Button icon={History} disabled title="Próximamente">Historial de versiones</Button>
            <Button variant="primary" icon={Send} disabled title="Próximamente">Publicar tabla</Button>
          </>
        }
      />
      <QueryState query={query} emptyTitle="Sin tabla de tasas" emptyText="El servicio todavía no expone la tabla de tasas de este escenario.">
        {table => (
          <>
            <RatesTableCard table={table} />
            <div className={s.insights}>
              <ConversionRulesCard table={table} />
              <RateControlsCard table={table} />
            </div>
          </>
        )}
      </QueryState>
    </Stack>
  )
}
