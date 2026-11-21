import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useRepository } from '@/app/di'
import { useScenarioContext } from '@/shared/hooks/useScenarioContext'
import { DEFAULT_VIEW, parseView } from '../domain/profitability'
import type { ProfitabilityView } from '../domain/types'

/** La vista (con/sin eliminación IC) vive en la URL: `?vista=sin-eliminar`. */
export function useProfitabilityView(): [ProfitabilityView, (view: ProfitabilityView) => void] {
  const [params, setParams] = useSearchParams()
  const view = parseView(params.get('vista'))
  const setView = useCallback((next: ProfitabilityView) => {
    setParams(prev => {
      const copy = new URLSearchParams(prev)
      if (next === DEFAULT_VIEW) copy.delete('vista'); else copy.set('vista', next)
      return copy
    }, { replace: true })
  }, [setParams])
  return [view, setView]
}

export function useProfitability(view: ProfitabilityView) {
  const repo = useRepository('profitability')
  const { query } = useScenarioContext()
  return useQuery({
    queryKey: ['profitability', query.scenarioId, view],
    queryFn: ({ signal }) => repo.getReport(query, view, signal),
  })
}
