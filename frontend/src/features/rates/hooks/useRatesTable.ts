import { useQuery } from '@tanstack/react-query'
import { useRepository } from '@/app/di/RepositoriesProvider'
import { useScenarioContext } from '@/shared/hooks/useScenarioContext'

/** Tabla de tasas del grupo para el escenario activo. */
export function useRatesTable() {
  const repo = useRepository('rates')
  const { query } = useScenarioContext()
  return useQuery({
    queryKey: ['rates', 'table', query.scenarioId, query.currency],
    queryFn: ({ signal }) => repo.getTable(query, signal),
  })
}
