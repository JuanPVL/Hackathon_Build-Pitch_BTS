import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { CompanyCode } from '@/entities'
import { parseView } from '../domain/matrix'
import { formatPairParam, parsePairParam } from '../domain/pair'
import type { PairSelection } from '../domain/pair'
import type { MatrixView } from '../domain/types'

/** Vista (`vista`) y par seleccionado (`par=GT1-MX1`) viven en la URL. */
export function useAccountSelection() {
  const [params, setParams] = useSearchParams()
  const view = parseView(params.get('vista'))
  const rawPair = params.get('par')
  const pair = useMemo(() => parsePairParam(rawPair), [rawPair])

  const update = useCallback((mutate: (p: URLSearchParams) => void) => {
    setParams(prev => { const next = new URLSearchParams(prev); mutate(next); return next }, { replace: true })
  }, [setParams])

  const setView = useCallback((next: MatrixView) => update(p => { if (next === 'saldo') p.delete('vista'); else p.set('vista', next) }), [update])
  const selectPair = useCallback((company: CompanyCode, counterparty: CompanyCode) => {
    const sel: PairSelection = { company, counterparty }
    update(p => p.set('par', formatPairParam(sel)))
  }, [update])
  const clearPair = useCallback(() => update(p => p.delete('par')), [update])

  return { view, pair, setView, selectPair, clearPair }
}
