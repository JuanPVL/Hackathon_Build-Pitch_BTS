import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { CurrencyCode, ScenarioQuery } from '@/entities'

export interface ScenarioOption { id: string; label: string; short: string }

/** Escenarios disponibles (tabla `scenario`). Se reemplazará por GET /scenarios cuando exista. */
export const SCENARIOS: ScenarioOption[] = [
  { id: 'PPTO_V1', label: 'Presupuesto 2027 · V1', short: 'V1' },
  { id: 'PPTO_V2', label: 'Presupuesto 2027 · V2', short: 'V2' },
]
export const DEFAULT_SCENARIO = 'PPTO_V2'

export interface ScenarioContext {
  query: ScenarioQuery
  scenario: ScenarioOption
  setScenario: (id: string) => void
}

/**
 * Escenario y moneda viven en la URL (`?esc=PPTO_V1`) para que cada vista se pueda
 * compartir y recargar sin perder el contexto.
 */
export function useScenarioContext(): ScenarioContext {
  const [params, setParams] = useSearchParams()
  const requested = params.get('esc')
  const scenario = SCENARIOS.find(s => s.id === requested) ?? SCENARIOS.find(s => s.id === DEFAULT_SCENARIO)!
  const currency: CurrencyCode = 'USD'

  const setScenario = useCallback((id: string) => {
    setParams(prev => {
      const next = new URLSearchParams(prev)
      if (id === DEFAULT_SCENARIO) next.delete('esc'); else next.set('esc', id)
      return next
    }, { replace: true })
  }, [setParams])

  const query = useMemo<ScenarioQuery>(() => ({ scenarioId: scenario.id, currency }), [scenario.id])
  return { query, scenario, setScenario }
}
