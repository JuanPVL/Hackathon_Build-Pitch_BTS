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
              {matrix.receivedIsBilledTranspose && <Callout tone="info">Vista recibida = facturación de emisores agrupada por receptor. La API no expone una matriz de recepción independiente.</Callout>}
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
