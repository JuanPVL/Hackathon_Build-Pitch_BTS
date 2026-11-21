import { Card, CardHeader, Grid, PageHeader, QueryState, SegmentedControl, Split, Stack, StateMessage } from '@/shared/ui'
import { TYPE_FILTER_OPTIONS } from './domain/filters'
import { useReconciliation } from './hooks/useReconciliation'
import { useTypeFilter } from './hooks/useTypeFilter'
import { ReconciliationStats } from './ui/ReconciliationStats'
import { PairsTable } from './ui/PairsTable'
import { DifferencePanel } from './ui/DifferencePanel'

const RECONCILIATION_KPI_GUIDE = [
  {
    title: 'Documentos intercompany (Cobertura bilateral)',
    purpose: 'Verifica que cada factura, préstamo o interés intragrupo tenga sus dos patas identificadas por llave única (Emisor CxC/Ingreso ↔ Receptor CxP/Gasto) antes de eliminar.',
  },
  {
    title: 'Cuadran exacto (Eliminación directa)',
    purpose: 'Operaciones donde el monto convertido del vendedor y del comprador coinciden al centavo en USD. Se eliminan automáticamente en los asientos E1–E4 sin ajuste cambiario.',
  },
  {
    title: 'Diferencia cambiaria (Aislada en 7900 / 3900)',
    purpose: 'Ambas empresas pactaron el mismo monto en moneda local (GTQ o MXN), pero las tasas de conversión generan un diferencial menor al umbral permitido. El motor concilia el par y aísla el efecto FX.',
  },
  {
    title: 'Pendientes (Control anti-forzado)',
    purpose: 'Operaciones sin contraparte, con diferencia de monto o desfase de mes. QUADRA prohíbe eliminarlas a la fuerza para no esconder errores; requieren aceptación o disputa documentada.',
  },
] as const

export default function ReconciliationPage() {
  const filter = useTypeFilter()
  const query = useReconciliation(filter.type)

  return (
    <Stack>
      <PageHeader
        eyebrow="PASO 2 · CONCILIAR"
        title="Cada venta entre empresas nace en pareja"
        subtitle="Se concilia por la llave del documento, no por monto ni por texto. Cada diferencia tiene nombre y una acción del sistema."
        actions={query.data?.typeFilterAvailable === false ? undefined : <SegmentedControl label="Filtrar por tipo de documento" options={TYPE_FILTER_OPTIONS} value={filter.value} onChange={filter.setValue} />}
      />
      <QueryState query={query} emptyTitle="Sin conciliación disponible" emptyText="Todavía no hay documentos intercompany para este escenario.">
        {report => (
          <>
            <ReconciliationStats totals={report.totals} />
            <Card aria-label="Guía de indicadores de conciliación">
              <CardHeader title="¿Para qué sirve cada indicador de conciliación?" aside="Guía operativa del motor IC" />
              <Grid cols={4}>
                {RECONCILIATION_KPI_GUIDE.map(item => (
                  <div
                    key={item.title}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid var(--q-line)',
                      background: 'var(--q-surface-alt, #f8fafc)',
                      fontSize: 12,
                      lineHeight: 1.45,
                    }}
                  >
                    <strong style={{ display: 'block', marginBottom: 4, color: 'var(--q-ink)' }}>{item.title}</strong>
                    <span style={{ color: 'var(--q-muted)' }}>{item.purpose}</span>
                  </div>
                ))}
              </Grid>
            </Card>
            <Split aside={360}>
              {report.pairs.length === 0
                ? <StateMessage kind="empty" title="Sin documentos para este filtro">Prueba con otro tipo de documento.</StateMessage>
                : <PairsTable report={report} />}
              <DifferencePanel byResult={report.byResult} />
            </Split>
          </>
        )}
      </QueryState>
    </Stack>
  )
}
