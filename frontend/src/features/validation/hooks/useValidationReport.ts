import { useQuery } from '@tanstack/react-query'
import { useRepository } from '@/app/di/RepositoriesProvider'
import { useScenarioContext } from '@/shared/hooks/useScenarioContext'

/** Reporte de validación del escenario activo. Lo comparten la página y el estado de publicación. */
export function useValidationReport() {
  const repo = useRepository('validation')
  const { query } = useScenarioContext()
  return useQuery({
    queryKey: ['validation', 'report', query.scenarioId, query.currency],
    queryFn: ({ signal }) => repo.getReport(query, signal),
  })
}
