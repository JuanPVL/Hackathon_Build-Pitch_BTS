import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useRepository } from '@/app/di/RepositoriesProvider'
import { useScenarioContext } from '@/shared/hooks/useScenarioContext'
import type { IcType } from '../domain/types'

export function useReconciliation(type: IcType | undefined) {
  const repo = useRepository('reconciliation')
  const { query } = useScenarioContext()
  return useQuery({
    queryKey: ['reconciliation', query.scenarioId, type ?? 'TODAS'],
    queryFn: ({ signal }) => repo.getReport(query, { type }, signal),
    placeholderData: keepPreviousData,
  })
}
