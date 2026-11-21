import { useQuery } from '@tanstack/react-query'
import { useRepository } from '@/app/di/RepositoriesProvider'
import { useScenarioContext } from '@/shared/hooks/useScenarioContext'
import type { PairSelection } from '../domain/pair'

/** Detalle del par seleccionado; sin selección no consulta. */
export function usePairDetail(pair: PairSelection | null) {
  const repo = useRepository('currentAccount')
  const { query } = useScenarioContext()
  return useQuery({
    queryKey: ['current-account', 'pair', query.scenarioId, pair?.company, pair?.counterparty],
    queryFn: ({ signal }) => repo.getPair(query, pair!.company, pair!.counterparty, signal),
    enabled: pair !== null,
  })
}
