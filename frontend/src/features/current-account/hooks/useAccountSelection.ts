import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { CompanyCode } from '@/entities'
import { parseView } from '../domain/matrix'
import { formatPairParam, parsePairParam } from '../domain/pair'
import type { PairSelection } from '../domain/pair'
import type { MatrixView } from '../domain/types'

/** Vista (`vista`) y par seleccionado (`par=GT1-MX1`) viven en estado reactivo local sincronizado con la URL. */
export function useAccountSelection() {
  const [params, setParams] = useSearchParams()
  const urlView = parseView(params.get('vista'))
  const rawPair = params.get('par')
  const [view, setLocalView] = useState<MatrixView>(urlView)
  const [pairStr, setLocalPairStr] = useState<string | null>(rawPair)

  useEffect(() => {
    setLocalView(urlView)
  }, [urlView])

  useEffect(() => {
    setLocalPairStr(rawPair)
  }, [rawPair])

  const pair = useMemo(() => parsePairParam(pairStr), [pairStr])

  const update = useCallback((mutate: (p: URLSearchParams) => void) => {
    setParams(prev => { const next = new URLSearchParams(prev); mutate(next); return next }, { replace: true })
  }, [setParams])

  const setView = useCallback((next: MatrixView) => {
    setLocalView(next)
    update(p => { if (next === 'saldo') p.delete('vista'); else p.set('vista', next) })
  }, [update])
  const selectPair = useCallback((company: CompanyCode, counterparty: CompanyCode) => {
    const sel: PairSelection = { company, counterparty }
    const formatted = formatPairParam(sel)
    setLocalPairStr(formatted)
    update(p => p.set('par', formatted))
  }, [update])
  const clearPair = useCallback(() => {
    setLocalPairStr(null)
    update(p => p.delete('par'))
  }, [update])

  return { view, pair, setView, selectPair, clearPair }
}
