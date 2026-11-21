import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { filterToIcType, parseTypeFilter } from '../domain/filters'
import type { TypeFilterValue } from '../domain/filters'

/** El filtro por tipo vive en estado local reactivo y se sincroniza con la URL (`?tipo=VENTA`). */
export function useTypeFilter() {
  const [params, setParams] = useSearchParams()
  const urlValue = parseTypeFilter(params.get('tipo'))
  const [value, setLocalValue] = useState<TypeFilterValue>(urlValue)

  useEffect(() => {
    setLocalValue(urlValue)
  }, [urlValue])

  const setValue = useCallback((next: TypeFilterValue) => {
    setLocalValue(next)
    setParams(prev => {
      const p = new URLSearchParams(prev)
      if (next === 'TODAS') p.delete('tipo'); else p.set('tipo', next)
      return p
    }, { replace: true })
  }, [setParams])
  return { value, type: filterToIcType(value), setValue }
}
