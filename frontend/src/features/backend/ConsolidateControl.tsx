import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useBackend } from '@/shared/api/useBackend'
import { useBackendAccess } from '@/shared/auth/useBackendAccess'
import { useScenarioContext } from '@/shared/hooks'
import { Button } from '@/shared/ui'

export function ConsolidateControl() {
  const backend = useBackend()
  const access = useBackendAccess()
  const cache = useQueryClient()
  const { query } = useScenarioContext()
  const mutation = useMutation({
    mutationFn: () => backend.consolidate(query.scenarioId),
    onSuccess: async () => {
      await cache.invalidateQueries({ predicate: entry => ['consolidation', 'validation', 'reconciliation', 'current-account', 'eliminations', 'profitability'].includes(String(entry.queryKey[0])) })
    },
  })
  return <div>
    <Button variant="primary" disabled={!access.data?.permissions.writeAll || mutation.isPending}
      title={access.data?.permissions.writeAll ? 'Crear una nueva corrida inmutable' : 'Requiere permiso de escritura de grupo'}
      onClick={() => mutation.mutate()}>{mutation.isPending ? 'Consolidando…' : 'Ejecutar consolidación'}</Button>
    {mutation.isError && <p role="alert">{mutation.error.message}</p>}
    {mutation.isSuccess && <p role="status">Corrida creada: {mutation.data.run.runId}</p>}
  </div>
}
