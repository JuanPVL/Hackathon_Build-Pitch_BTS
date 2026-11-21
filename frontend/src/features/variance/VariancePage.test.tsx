import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { ApiError } from '@/shared/api/httpClient'
import VariancePage from './VariancePage'
import { bridge } from './testing/bridgeFixture'
import type { VarianceBridge } from './domain/types'

const withNarrative: VarianceBridge = {
  ...bridge,
  byCompany: [
    { effect: 'VOLUMEN', label: 'Volumen', company: 'MX1', value: 300000 },
    { effect: 'COSTO', label: 'Costo de ventas', company: 'MX1', value: -174000 },
  ],
  narrative: {
    text: 'El EBIT consolidado subió USD 48,599 de V1 a V2.',
    verifiedFigures: 9,
    totalFigures: 9,
    causes: [{ text: 'Volumen: +USD 300,000 por más unidades vendidas en MX1.', sourceId: 'BR-VOL-MX1' }],
  },
}

describe('VariancePage', () => {
  it('muestra Δ, cascada, narrativa verificada y puente del EVA', async () => {
    const getBridge = vi.fn(async () => withNarrative)
    renderWithProviders(<VariancePage />, { repositories: { variance: { getBridge } } })
    expect(await screen.findByText('+48,599')).toBeInTheDocument()
    expect(getBridge).toHaveBeenCalledWith({ from: 'PPTO_V1', to: 'PPTO_V2', metric: 'EBIT' }, expect.anything())
    expect(screen.getByRole('heading', { level: 1, name: '¿Por qué cambió el EBIT?' })).toBeInTheDocument()
    expect(screen.getByText('Residual 0.00')).toBeInTheDocument()
    expect(screen.getByText(/de 2,360,308 a 2,408,907 \(\+2\.1 %\)/)).toBeInTheDocument()
    expect(screen.getAllByText('+300,000').length).toBeGreaterThan(0)
    expect(screen.getAllByText('−120,000').length).toBeGreaterThan(0)
    expect(screen.getAllByText('−90,000').length).toBeGreaterThan(0)
    expect(screen.getAllByText('−41,401').length).toBeGreaterThan(0)
    expect(screen.getByText('[BR-VOL-MX1]')).toBeInTheDocument()
    expect(screen.getByText(/9 de 9 cifras verificadas/)).toBeInTheDocument()
    expect(screen.getByText('−94,982')).toBeInTheDocument()
    expect(screen.getByText('−149,432')).toBeInTheDocument()
  })

  it('sin narrativa muestra solo la tabla de efectos con su explicación', async () => {
    renderWithProviders(<VariancePage />, { repositories: { variance: { getBridge: async () => bridge } } })
    expect(await screen.findByText('+48,599')).toBeInTheDocument()
    expect(screen.queryByText(/cifras verificadas/)).not.toBeInTheDocument()
    expect(screen.getByText(/Todavía no hay texto redactado/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Efectos calculados' })).toBeInTheDocument()
  })

  it('cambia la métrica y vuelve a consultar', async () => {
    const getBridge = vi.fn(async () => bridge)
    renderWithProviders(<VariancePage />, { repositories: { variance: { getBridge } } })
    await screen.findByText('+48,599')
    await userEvent.click(screen.getByRole('button', { name: 'EVA' }))
    expect(await screen.findByRole('heading', { level: 1, name: '¿Por qué cambió el EVA?' })).toBeInTheDocument()
    expect(getBridge).toHaveBeenLastCalledWith({ from: 'PPTO_V1', to: 'PPTO_V2', metric: 'EVA' }, expect.anything())
  })

  it('tiene selectores de versión etiquetados', async () => {
    renderWithProviders(<VariancePage />, { repositories: { variance: { getBridge: async () => bridge } } })
    expect(await screen.findByLabelText('Desde')).toHaveValue('PPTO_V1')
    expect(screen.getByLabelText('Hasta')).toHaveValue('PPTO_V2')
  })

  it('muestra el estado vacío ante un 404', async () => {
    renderWithProviders(<VariancePage />, { repositories: { variance: { getBridge: () => Promise.reject(new ApiError(404, 'x')) } } })
    expect(await screen.findByRole('heading', { name: 'Aún no hay puente' })).toBeInTheDocument()
  })
})
