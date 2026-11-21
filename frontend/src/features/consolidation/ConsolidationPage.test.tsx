import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { ApiError } from '@/shared/api/httpClient'
import ConsolidationPage from './ConsolidationPage'
import type { ConsolidationRepository } from './ports/ConsolidationRepository'
import type { ConsolidationSummary } from './domain/types'

const summary: ConsolidationSummary = {
  runId: 'C-2027-V2-003',
  generatedAt: '2026-11-21T10:42:00',
  lineageOk: true,
  lineage: { accountsOk: 23, accountsTotal: 23 },
  steps: [
    { code: 'VALIDAR', closed: true, caption: '0 hallazgos abiertos' },
    { code: 'CONCILIAR', closed: true, caption: '131 de 131 documentos' },
    { code: 'CONVERTIR', closed: true, caption: '1 tabla de tasas del grupo' },
    { code: 'ELIMINAR', closed: true, caption: '−977.5 K ventas IC' },
    { code: 'EXPLICAR', closed: true, caption: 'ROIC, ROCE, EVA y V1→V2' },
  ],
  sales: { aggregate: 13935093, eliminations: 977540, consolidated: 12957553, icDocuments: 131 },
  fxDifferenceIc: 2039,
  kpis: [
    { code: 'EBIT', value: 2408907, unit: 'USD', withoutElimination: 2408579, formula: 'Ventas − costos − gastos operativos' },
    { code: 'ROIC', value: 0.1195, unit: 'RATIO', withoutElimination: 0.1195, formula: 'NOPAT / CI' },
    { code: 'ROCE', value: 0.1322, unit: 'RATIO', withoutElimination: 0.1191, formula: 'EBIT / capital empleado' },
    { code: 'EVA', value: 142157, unit: 'USD', withoutElimination: 141933, formula: 'NOPAT − WACC × capital invertido' },
  ],
  incomeStatement: [
    { account: '4100', name: 'Ventas a terceros', aggregate: 12957553, elimination: 0, consolidated: 12957553, isIntercompany: false },
    { account: '4200', name: 'Ventas intercompany', aggregate: 977540, elimination: -977540, consolidated: 0, isIntercompany: true },
  ],
  balanceSheet: [
    { account: '1100', name: 'Caja y bancos', aggregate: 500000, elimination: 0, consolidated: 500000, isIntercompany: false },
  ],
  evaByCompany: [
    { company: 'MX2', name: 'Gamma México', eva: -426308 },
    { company: 'MX1', name: 'Alfa México', eva: 376020 },
  ],
}

const repo = (impl: () => Promise<ConsolidationSummary>): ConsolidationRepository => ({ getSummary: impl })

describe('ConsolidationPage', () => {
  it('muestra la ecuación, los KPIs y las tablas con cifras formateadas', async () => {
    renderWithProviders(<ConsolidationPage />, { repositories: { consolidation: repo(async () => summary) } })
    expect(await screen.findByText('13,935,093')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Consolidado del grupo' })).toBeInTheDocument()
    expect(screen.getAllByText('977,540').length).toBeGreaterThan(0)
    expect(screen.getAllByText('12,957,553').length).toBeGreaterThan(0)
    expect(screen.getByText(/Sin eliminar: \+7\.5 % de ventas/)).toBeInTheDocument()
    expect(screen.getByText(/23 de 23 cuentas cuadran/)).toBeInTheDocument()
    expect(screen.getByText('2,408,907')).toBeInTheDocument()
    expect(screen.getByText('11.95 %')).toBeInTheDocument()
    expect(screen.getByText('142,157')).toBeInTheDocument()
    expect(screen.getByText('−426,308')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Exportar' })).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Comparar con V1' })).toHaveAttribute('href', '/desviaciones')
  })

  it('cambia entre P&L y Balance', async () => {
    renderWithProviders(<ConsolidationPage />, { repositories: { consolidation: repo(async () => summary) } })
    await screen.findByText('13,935,093')
    expect(screen.getAllByText('Ventas intercompany').length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('button', { name: 'Balance' }))
    expect(screen.getAllByText('Caja y bancos').length).toBeGreaterThan(0)
    expect(screen.queryByText('Ventas intercompany')).not.toBeInTheDocument()
  })

  it('muestra el estado vacío cuando el servicio responde 404', async () => {
    renderWithProviders(<ConsolidationPage />, { repositories: { consolidation: repo(() => Promise.reject(new ApiError(404, 'x'))) } })
    const empty = await screen.findByRole('heading', { name: 'Aún no hay consolidado' })
    expect(within(empty.parentElement as HTMLElement).getByText(/corrida/)).toBeInTheDocument()
  })
})
