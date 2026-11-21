import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useRepository } from '@/app/di'
import { SCENARIOS } from '@/shared/hooks/useScenarioContext'
import { DEFAULT_REQUEST, parseRequest } from '../domain/bridge'
import type { BridgeMetric, BridgeRequest } from '../domain/types'

const PARAM = { from: 'desde', to: 'hasta', metric: 'metrica' } as const

/** Versiones y métrica viven en la URL (`?desde=PPTO_V1&hasta=PPTO_V2&metrica=EBIT`). */
export function useBridgeRequest() {
  const [params, setParams] = useSearchParams()
  const from = params.get(PARAM.from)
  const to = params.get(PARAM.to)
  const metric = params.get(PARAM.metric)
  const request = useMemo(() => parseRequest({ from, to, metric }, SCENARIOS.map(s => s.id)), [from, to, metric])

  const update = useCallback((key: keyof BridgeRequest, value: string) => {
    setParams(prev => {
      const next = new URLSearchParams(prev)
      if (value === DEFAULT_REQUEST[key]) next.delete(PARAM[key]); else next.set(PARAM[key], value)
      return next
    }, { replace: true })
  }, [setParams])

  return {
    request,
    setFrom: (id: string) => update('from', id),
    setTo: (id: string) => update('to', id),
    setMetric: (m: BridgeMetric) => update('metric', m),
  }
}

export function useVarianceBridge(request: BridgeRequest) {
  const repo = useRepository('variance')
  return useQuery({
    queryKey: ['variance', request.from, request.to, request.metric],
    queryFn: ({ signal }) => repo.getBridge(request, signal),
  })
}
