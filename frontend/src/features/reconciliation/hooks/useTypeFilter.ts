import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { filterToIcType, parseTypeFilter } from '../domain/filters'
import type { TypeFilterValue } from '../domain/filters'

/** El filtro por tipo vive en la URL (`?tipo=VENTA`) para poder compartir la vista. */
export function useTypeFilter() {
  const [params, setParams] = useSearchParams()
  const value = parseTypeFilter(params.get('tipo'))
  const setValue = useCallback((next: TypeFilterValue) => {
    setParams(prev => {
      const p = new URLSearchParams(prev)
      if (next === 'TODAS') p.delete('tipo'); else p.set('tipo', next)
      return p
    }, { replace: true })
  }, [setParams])
  return { value, type: filterToIcType(value), setValue }
}
