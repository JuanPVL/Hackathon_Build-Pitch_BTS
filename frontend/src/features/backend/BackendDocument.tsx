import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useBackend } from '@/shared/api/useBackend'
import { useBackendAccess } from '@/shared/auth/useBackendAccess'
import { useScenarioContext } from '@/shared/hooks'
import { Button, ButtonLink, Callout, Card, PageHeader, QueryState, Stack } from '@/shared/ui'
import { formatMoney } from '@/shared/format/number'
import { numberOf } from '@/shared/api/backend'

/** Vista de los datos que la API sí expone; no inventa versión, ciclo de vida ni moneda pactada. */
export function BackendDocument({ documentKey }: { documentKey: string }) {
  const backend = useBackend()
  const access = useBackendAccess()
  const cache = useQueryClient()
  const { query: context } = useScenarioContext()
  const [version, setVersion] = useState('')
  const [reason, setReason] = useState('')
  const query = useQuery({
    queryKey: ['document-reconciliation', context.scenarioId, documentKey],
    queryFn: async ({ signal }) => {
      const run = await backend.latestRun(context.scenarioId, signal)
      const result = await backend.reconciliation(run.runId, signal)
      return result.reconciliation.filter(row => row.icDocumentId === documentKey)
    },
  })
  const action = useMutation({
    mutationFn: (operation: 'accept' | 'dispute') => operation === 'accept'
      ? backend.acceptDocument(documentKey, Number(version))
      : backend.disputeDocument(documentKey, Number(version), reason.trim()),
    onSuccess: async () => {
      // Una acción modifica el documento, no la corrida inmutable ya calculada.
      await cache.invalidateQueries({ queryKey: ['document-reconciliation'] })
    },
  })
  const receiver = query.data?.[0]?.receiverCompanyId
  const canWrite = access.data?.permissions.writeAll || access.data?.grants.some(grant => grant.companyId === receiver && grant.roleCode === 'COMPANY_ACCOUNTANT')
  const validVersion = /^\d+$/.test(version) && Number.isSafeInteger(Number(version)) && Number(version) > 0
  return <Stack><PageHeader eyebrow="CONCILIAR · DOCUMENTO" title={documentKey}
    subtitle="Importes reportados en la corrida seleccionada."
    actions={<ButtonLink to={`/conciliacion?esc=${context.scenarioId}`}>Volver a conciliación</ButtonLink>} />
    <QueryState query={query} isEmpty={rows => rows.length === 0} emptyTitle="Documento sin conciliación en este escenario">
      {rows => <><Card><h2>Registro de conciliación</h2>
        {rows.map(row => <section key={row.financialStatementCode}>
          <h3>{row.financialStatementCode} · {row.statusCode}</h3>
          <p>{row.issuerCompanyId ?? 'Emisor ausente'} → {row.receiverCompanyId ?? 'Receptor ausente'}</p>
          <p>Emisor: {formatMoney(numberOf(row.issuerUsd), 'USD', 2)} · Receptor: {formatMoney(numberOf(row.receiverUsd), 'USD', 2)}</p>
          <p>Diferencia: {formatMoney(numberOf(row.differenceUsd), 'USD', 2)}</p>
          <p>Referencias de origen: {row.lineRefs ?? 'No informadas'}</p>
        </section>)}
      </Card><Callout tone="info">La API no publica todavía la versión vigente ni el historial del documento. Los importes anteriores pertenecen a una corrida inmutable, no al estado actual del documento.</Callout>
      {canWrite && <Card><h2>Acción del receptor</h2>
        <p>Introduce la versión vigente confirmada del documento. La API valida la versión, los permisos y la transición.</p>
        <label>Versión vigente <input type="number" min="1" step="1" value={version} onChange={e => { setVersion(e.target.value); action.reset() }} /></label>
        <label style={{ display: 'block', margin: '16px 0' }}>Motivo de disputa <textarea maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label>
        <Button disabled={!validVersion || action.isPending} onClick={() => action.mutate('accept')}>Aceptar documento</Button>{' '}
        <Button disabled={!validVersion || !reason.trim() || action.isPending} onClick={() => action.mutate('dispute')}>Disputar documento</Button>
        {action.isError && <p role="alert">{action.error.message}</p>}
        {action.isSuccess && <p role="status">Estado confirmado por la API: {action.data.statusCode} · versión {action.data.version}. Ejecuta una nueva consolidación para actualizar resultados.</p>}
      </Card>}</>}
    </QueryState>
  </Stack>
}
