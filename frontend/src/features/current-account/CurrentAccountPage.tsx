import { Callout, PageHeader, QueryState, SegmentedControl, Split, Stack } from '@/shared/ui'
import { VIEW_OPTIONS } from './domain/matrix'
import { useAccountSelection } from './hooks/useAccountSelection'
import { useBalanceMatrix } from './hooks/useBalanceMatrix'
import { useIsMobile } from '@/shared/hooks'
import { usePairDetail } from './hooks/usePairDetail'
import { BalanceMatrixTable } from './ui/BalanceMatrixTable'
import { MatrixTotals } from './ui/MatrixTotals'
import { MobileAccountView } from './ui/MobileAccountView'
import { PairPanel, PairPlaceholder } from './ui/PairPanel'

export default function CurrentAccountPage() {
  const { view, pair, setView, selectPair, clearPair } = useAccountSelection()
  const matrixQuery = useBalanceMatrix(view)
  const pairQuery = usePairDetail(pair)
  const isMobile = useIsMobile()

  const detail = pair ? <PairPanel pair={pair} query={pairQuery} onClose={clearPair} /> : <PairPlaceholder />

  return (
    <Stack>
      <PageHeader
        eyebrow="PASO 2 · CONCILIAR · CUENTA CORRIENTE"
        title="Cuenta corriente entre empresas"
        subtitle={isMobile
          ? 'Elige una empresa y ve con quién tiene saldo. La matriz completa se ve en pantallas grandes.'
          : 'Cuánto le facturé a cada empresa, cuánto me facturó y el saldo neto. Cada factura nace en pareja y se concilia por su llave.'}
        actions={<SegmentedControl label="Vista de la cuenta corriente" options={VIEW_OPTIONS} value={view} onChange={setView} />}
      />
      <QueryState query={matrixQuery} emptyTitle="Sin cuenta corriente" emptyText="Todavía no hay saldos intercompany para este escenario.">
        {matrix => isMobile
          ? <MobileAccountView matrix={matrix} selected={pair} onSelectPair={selectPair} detail={pair ? detail : null} />
          : (
            <>
              <MatrixTotals totals={matrix.totals} />
              <Callout tone="info">
                {view === 'saldo' && (
                  <>
                    <strong>Vista activa: Saldos al cierre (Balance General)</strong> · Muestra las cuentas por cobrar (<code>+</code> en azul) y cuentas por pagar / préstamos (<code>−</code> en naranja) abiertas al 31 de diciembre entre las 6 empresas.
                  </>
                )}
                {view === 'facturado' && (
                  <>
                    <strong>Vista activa: Facturado en el año (Estado de Resultados · Emisor)</strong> · Muestra los ingresos intercompany facturados por cada empresa vendedora (fila) a su compradora (columna) convertidos a tasa del emisor.
                  </>
                )}
                {view === 'recibido' && (
                  <>
                    <strong>Vista activa: Recibido en el año (Estado de Resultados · Receptor)</strong> · Vista recibida = facturación de emisores agrupada por receptor y convertida a la tasa de cada empresa compradora (en signo negativo por representar costo/gasto IC recibido).
                  </>
                )}
              </Callout>
              <Split aside={400}>
                <BalanceMatrixTable matrix={matrix} selected={pair} onSelect={selectPair} />
                {detail}
              </Split>
            </>
          )}
      </QueryState>
    </Stack>
  )
}
