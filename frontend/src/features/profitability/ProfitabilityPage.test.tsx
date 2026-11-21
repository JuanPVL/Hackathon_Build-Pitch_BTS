import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { ApiError } from '@/shared/api/httpClient'
import ProfitabilityPage from './ProfitabilityPage'
import type { ProfitabilityRepository } from './ports/ProfitabilityRepository'
import type { ProfitabilityReport } from './domain/types'

const report: ProfitabilityReport = {
  view: 'consolidado',
  wacc: 0.11,
  effectiveTaxRate: 0.2586,
  kpis: [
    {
      code: 'ROIC', value: 0.1195, unit: 'RATIO', formula: 'ROIC = NOPAT ÷ capital invertido', note: 'Retorno sobre el capital invertido del grupo.',
      components: [{ label: 'NOPAT', value: 1785910, unit: 'USD' }, { label: 'Capital invertido', value: 14943212, unit: 'USD' }],
    },
    {
      code: 'ROCE', value: 0.1322, unit: 'RATIO', formula: 'ROCE = EBIT ÷ capital empleado', note: 'Nota ROCE',
      components: [{ label: 'EBIT (utilidad operativa)', value: 2408907, unit: 'USD' }],
    },
    {
      code: 'EVA', value: 142157, unit: 'USD', formula: 'EVA = NOPAT − WACC × capital invertido', note: 'Nota EVA',
      components: [{ label: 'WACC (parámetro V2)', value: 0.11, unit: 'RATIO' }],
    },
  ],
  byCompany: [
    { company: 'MX2', name: 'Gamma México', roic: -0.1251, roce: -0.1599, eva: -426308 },
    { company: 'MX1', name: 'Alfa México', roic: 0.2107, roce: 0.27, eva: 376020 },
  ],
  eliminationComparison: [{ label: 'Capital empleado', left: 20220000, right: 18223385, unit: 'USD' }],
  unvalidatedComparison: [{ label: 'ROIC', left: -1.919, right: 0.1157, unit: 'RATIO' }],
}

describe('ProfitabilityPage', () => {
  it('muestra KPIs, tabla por empresa y comparativos', async () => {
    const getReport = vi.fn(async () => report)
    const repo: ProfitabilityRepository = { getReport }
    renderWithProviders(<ProfitabilityPage />, { repositories: { profitability: repo } })
    expect(await screen.findByText('1,785,910')).toBeInTheDocument()
    expect(getReport).toHaveBeenCalledWith({ scenarioId: 'PPTO_V2', currency: 'USD' }, 'consolidado', expect.anything())
    expect(screen.getByText('11.95 %')).toBeInTheDocument()
    expect(screen.getByText('13.22 %')).toBeInTheDocument()
    expect(screen.getByText('142,157')).toBeInTheDocument()
    expect(screen.getAllByText('+376,020').length).toBeGreaterThan(0)
    expect(screen.getAllByText('−426,308').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Crea valor').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Destruye').length).toBeGreaterThan(0)
    expect(screen.getByText('20.22 M')).toBeInTheDocument()
    expect(screen.getByText('−191.90 %')).toBeInTheDocument()
    expect(screen.getByText(/No es EBITDA/)).toBeInTheDocument()
  })

  it('lee la vista desde la URL y la cambia al elegir "Sin eliminar"', async () => {
    const getReport = vi.fn(async () => report)
    renderWithProviders(<ProfitabilityPage />, { repositories: { profitability: { getReport } } })
    await screen.findByText('1,785,910')
    await userEvent.click(screen.getByRole('button', { name: 'Sin eliminar' }))
    await screen.findByText('1,785,910')
    expect(getReport).toHaveBeenLastCalledWith(expect.anything(), 'sin-eliminar', expect.anything())
  })

  it('muestra el estado vacío ante un 404', async () => {
    renderWithProviders(<ProfitabilityPage />, { repositories: { profitability: { getReport: () => Promise.reject(new ApiError(404, 'x')) } } })
    expect(await screen.findByRole('heading', { name: 'Aún no hay rentabilidad' })).toBeInTheDocument()
  })
})
