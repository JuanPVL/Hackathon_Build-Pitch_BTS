import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { parseView } from '../domain/eliminations'
import type { EliminationView } from '../domain/eliminations'

/** La vista Antes/Después vive en la URL (`?vista=antes`) para poder compartirla. */
export function useEliminationView(): [EliminationView, (view: EliminationView) => void] {
  const [params, setParams] = useSearchParams()
  const view = parseView(params.get('vista'))
  const setView = useCallback((next: EliminationView) => {
    setParams(prev => {
      const copy = new URLSearchParams(prev)
      if (next === 'despues') copy.delete('vista'); else copy.set('vista', next)
      return copy
    }, { replace: true })
  }, [setParams])
  return [view, setView]
}
