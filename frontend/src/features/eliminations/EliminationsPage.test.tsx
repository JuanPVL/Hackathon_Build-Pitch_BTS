import { describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { ApiError } from '@/shared/api/httpClient'
import type { EliminationRepository } from './ports/EliminationRepository'
import { buildReport } from './report.fixture'
import EliminationsPage from './EliminationsPage'

const repo = (getReport: EliminationRepository['getReport']): EliminationRepository => ({ getReport })

describe('EliminationsPage', () => {
  it('muestra resumen, asientos y capital con cifras formateadas', async () => {
    renderWithProviders(<EliminationsPage />, { repositories: { eliminations: repo(vi.fn().mockResolvedValue(buildReport())) } })
    expect(await screen.findByRole('heading', { level: 1, name: 'Lo que el grupo se vende a sí mismo se elimina solo' })).toBeInTheDocument()
    expect(await screen.findByText('PASO 4 · ELIMINAR · CORRIDA C-2027-V2-003')).toBeInTheDocument()

    expect(screen.getByText('1,533,540')).toBeInTheDocument()
    expect(screen.getByText('2,127,795')).toBeInTheDocument()
    expect(screen.getByText('+328')).toBeInTheDocument()
    expect(screen.getByText('Ingresos IC 1,373,540 vs gastos 1,373,868')).toBeInTheDocument()
    expect(screen.getByText('Generados de 131 pares conciliados')).toBeInTheDocument()

    // tabla + tarjetas móviles conviven en jsdom
    expect(screen.getAllByText('977,540').length).toBeGreaterThan(0)
    expect(screen.getAllByText('976,943').length).toBeGreaterThan(0)
    expect(screen.getAllByText('+597 → 7900').length).toBeGreaterThan(0)
    expect(screen.getAllByText('−21,391 → 3900').length).toBeGreaterThan(0)
    expect(screen.getAllByText('−2,039 P&L · −21,561 CTA').length).toBeGreaterThan(0)
    expect(screen.getByText('Las diferencias cuadran con lo aislado')).toBeInTheDocument()

    expect(screen.getByText('20.22 M')).toBeInTheDocument()
    expect(screen.getByText('2.00 M')).toBeInTheDocument()
    expect(screen.getByText('18.22 M')).toBeInTheDocument()
    expect(screen.getByText('11.91 %')).toBeInTheDocument()
    expect(screen.getByText('13.22 %')).toBeInTheDocument()
    expect(screen.getByText(/1\.31 puntos peor/)).toBeInTheDocument()
  })

  it('"Antes" (param vista) muestra las patas sin eliminar y sin diferencia', async () => {
    renderWithProviders(<EliminationsPage />, { route: '/?vista=antes', repositories: { eliminations: repo(vi.fn().mockResolvedValue(buildReport())) } })
    expect(await screen.findByText(/Sin eliminar, el grupo suma las dos patas/)).toBeInTheDocument()
    expect(screen.queryByText('+597 → 7900')).not.toBeInTheDocument()
    expect(screen.getAllByText('Suma de ambas patas').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Antes' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('alterna Antes/Después con el control segmentado', async () => {
    renderWithProviders(<EliminationsPage />, { repositories: { eliminations: repo(vi.fn().mockResolvedValue(buildReport())) } })
    await screen.findAllByText('+597 → 7900')
    await userEvent.click(screen.getByRole('button', { name: 'Antes' }))
    expect(await screen.findByText(/Sin eliminar, el grupo suma/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Después' }))
    expect((await screen.findAllByText('+597 → 7900')).length).toBeGreaterThan(0)
  })

  it('avisa si las diferencias no cuadran con lo aislado', async () => {
    const report = buildReport({ fxIsolated: { pnl: -2_039, cta: -1 } })
    renderWithProviders(<EliminationsPage />, { repositories: { eliminations: repo(vi.fn().mockResolvedValue(report)) } })
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('Las diferencias no cuadran con lo aislado.')).toBeInTheDocument()
  })

  it('404 → estado vacío', async () => {
    renderWithProviders(<EliminationsPage />, { repositories: { eliminations: repo(vi.fn().mockRejectedValue(new ApiError(404, 'x'))) } })
    expect(await screen.findByText('Sin eliminaciones')).toBeInTheDocument()
  })
})
