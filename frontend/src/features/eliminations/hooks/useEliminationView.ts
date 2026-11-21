import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { parseView } from '../domain/eliminations'
import type { EliminationView } from '../domain/eliminations'

/** La vista Antes/Después vive en estado local reactivo sincronizado con la URL (`?vista=antes`). */
export function useEliminationView(): [EliminationView, (view: EliminationView) => void] {
  const [params, setParams] = useSearchParams()
  const urlView = parseView(params.get('vista'))
  const [view, setLocalView] = useState<EliminationView>(urlView)

  useEffect(() => {
    setLocalView(urlView)
  }, [urlView])

  const setView = useCallback((next: EliminationView) => {
    setLocalView(next)
    setParams(prev => {
      const copy = new URLSearchParams(prev)
      if (next === 'despues') copy.delete('vista'); else copy.set('vista', next)
      return copy
    }, { replace: true })
  }, [setParams])
  return [view, setView]
}
