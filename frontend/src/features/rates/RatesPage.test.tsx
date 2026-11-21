import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { ApiError } from '@/shared/api/httpClient'
import type { RatesTable } from './domain/types'
import type { RatesRepository } from './ports/RatesRepository'
import RatesPage from './RatesPage'

const table: RatesTable = {
  version: 'V2',
  status: 'VIGENTE',
  appliedTo: 6,
  rows: [
    { currency: 'GTQ', name: 'Quetzal', companies: ['GT1', 'GT2'], budgetPrevious: 7.8, budget: 7.8, closing: 7.8, historical: 7.69, budgetToUsd: 0.128205 },
    { currency: 'MXN', name: 'Peso mexicano', companies: ['MX1', 'MX2'], budgetPrevious: 18, budget: 18.7, closing: 18.7, historical: 17, budgetToUsd: 0.053476 },
    { currency: 'USD', name: 'Dólar', companies: ['US1', 'US2'], budgetPrevious: 1, budget: 1, closing: 1, historical: 1, budgetToUsd: 1 },
  ],
  conversionRules: [
    { scope: 'Resultados (P&L)', rateType: 'PRESUPUESTO' },
    { scope: 'Activos y pasivos', rateType: 'CIERRE' },
    { scope: 'Patrimonio', rateType: 'HISTORICA' },
  ],
  ctaUsd: -241412,
  controlBandPct: 25,
  alerts: [
    { severity: 'INFO', title: 'V1 → V2: el peso pasó de 18.00 a 18.70', detail: 'Restó USD 41,401 a la utilidad operativa del grupo.' },
    { severity: 'BLOQUEANTE', title: 'Tasa invertida frenada en V1 (V08)', detail: 'MXN 2027-05 llegó como 18.0 USD por peso en vez de 0.0556.', rule: 'V08' },
  ],
}

const repo = (getTable: RatesRepository['getTable']): RatesRepository => ({ getTable })

describe('RatesPage', () => {
  it('muestra tasas, variación MXN, reglas y controles con cifras formateadas', async () => {
    renderWithProviders(<RatesPage />, { repositories: { rates: repo(vi.fn().mockResolvedValue(table)) } })
    expect(await screen.findByRole('heading', { level: 1, name: 'Una sola tabla de tasas para todo el grupo' })).toBeInTheDocument()
    // tabla + tarjetas móviles conviven en jsdom (el CSS decide cuál se ve)
    expect((await screen.findAllByText('18.70')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('18.00').length).toBeGreaterThan(0)
    expect(screen.getAllByText('0.053476 USD').length).toBeGreaterThan(0)
    expect(screen.getAllByText('0.128205 USD').length).toBeGreaterThan(0)
    expect(screen.getAllByText('+3.9 %', { exact: false }).length).toBeGreaterThan(0)
    expect(screen.getByText('Vigente V2 · aplicada a las 6 empresas')).toBeInTheDocument()

    expect(screen.getByText('Resultados (P&L)')).toBeInTheDocument()
    expect(screen.getByText('HISTÓRICA')).toBeInTheDocument()
    expect(screen.getByText('USD −241,412 en V2: el balance cuadra sin forzarlo.')).toBeInTheDocument()
    expect(screen.getByText('Banda de control: ±25 % contra la mediana de tasas.')).toBeInTheDocument()
    expect(screen.queryByText('Tres monedas por factura')).not.toBeInTheDocument()
  })

  it('las alertas bloqueantes van primero y usan rol alert', async () => {
    renderWithProviders(<RatesPage />, { repositories: { rates: repo(vi.fn().mockResolvedValue(table)) } })
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Tasa invertida frenada en V1 (V08)')
    expect(screen.getByText('V1 → V2: el peso pasó de 18.00 a 18.70')).toBeInTheDocument()
  })

  it('acciones sin implementar están deshabilitadas', async () => {
    renderWithProviders(<RatesPage />, { repositories: { rates: repo(vi.fn().mockResolvedValue(table)) } })
    await screen.findAllByText('18.70')
    for (const name of ['Historial de versiones', 'Publicar tabla']) {
      const b = screen.getByRole('button', { name })
      expect(b).toBeDisabled()
      expect(b).toHaveAttribute('title', 'Próximamente')
    }
  })

  it('404 → estado vacío', async () => {
    renderWithProviders(<RatesPage />, { repositories: { rates: repo(vi.fn().mockRejectedValue(new ApiError(404, 'x'))) } })
    expect(await screen.findByText('Sin tabla de tasas')).toBeInTheDocument()
  })
})
