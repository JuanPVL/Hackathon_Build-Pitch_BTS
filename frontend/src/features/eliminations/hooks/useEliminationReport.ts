import { useQuery } from '@tanstack/react-query'
import { useRepository } from '@/app/di/RepositoriesProvider'
import { useScenarioContext } from '@/shared/hooks/useScenarioContext'

/** Asientos de eliminación del escenario activo. */
export function useEliminationReport() {
  const repo = useRepository('eliminations')
  const { query } = useScenarioContext()
  return useQuery({
    queryKey: ['eliminations', 'report', query.scenarioId, query.currency],
    queryFn: ({ signal }) => repo.getReport(query, signal),
  })
}
