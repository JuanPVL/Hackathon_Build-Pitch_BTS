import { useQuery } from '@tanstack/react-query'
import { useRepository } from '@/app/di/RepositoriesProvider'
import { useScenarioContext } from '@/shared/hooks/useScenarioContext'
import { ApiError } from '@/shared/api/httpClient'

/** Documento IC con sus patas, linaje, ciclo de vida y eventos. Sin llave no consulta. */
export function useIcDocument(key: string | undefined) {
  const repo = useRepository('icDocument')
  const { query } = useScenarioContext()
  return useQuery({
    queryKey: ['ic-document', query.scenarioId, key],
    queryFn: ({ signal }) => repo.getDocument(key!, query.scenarioId, signal),
    enabled: !!key,
    // Una llave inexistente no mejora al reintentar.
    retry: (count, error) => !(error instanceof ApiError && error.isNotFound) && count < 2,
  })
}
