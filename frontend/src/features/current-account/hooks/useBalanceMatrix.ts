import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useRepository } from '@/app/di/RepositoriesProvider'
import { useScenarioContext } from '@/shared/hooks/useScenarioContext'
import type { MatrixView } from '../domain/types'

export function useBalanceMatrix(view: MatrixView) {
  const repo = useRepository('currentAccount')
  const { query } = useScenarioContext()
  return useQuery({
    queryKey: ['current-account', 'matrix', query.scenarioId, query.currency, view],
    queryFn: ({ signal }) => repo.getMatrix(query, view, signal),
    placeholderData: keepPreviousData,
  })
}
