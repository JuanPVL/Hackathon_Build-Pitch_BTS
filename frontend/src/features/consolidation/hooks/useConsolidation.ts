import { useQuery } from '@tanstack/react-query'
import { useRepository } from '@/app/di'
import { useScenarioContext } from '@/shared/hooks/useScenarioContext'

export function useConsolidation() {
  const repo = useRepository('consolidation')
  const { query, scenario } = useScenarioContext()
  const result = useQuery({
    queryKey: ['consolidation', query.scenarioId, query.currency],
    queryFn: ({ signal }) => repo.getSummary(query, signal),
  })
  return { ...result, scenario }
}
