import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import ReconciliationPage from './ReconciliationPage'
import { reconciliationReport } from './reconciliation.fixtures'
import type { ReconciliationRepository } from './ports/ReconciliationRepository'

function fakeRepo(): ReconciliationRepository & { getReport: ReturnType<typeof vi.fn> } {
  return { getReport: vi.fn().mockResolvedValue(reconciliationReport) }
}

describe('ReconciliationPage', () => {
  it('muestra totales, pares y el panel de diferencias', async () => {
    const reconciliation = fakeRepo()
    renderWithProviders(<ReconciliationPage />, { repositories: { reconciliation }, route: '/conciliacion' })

    expect(screen.getByRole('heading', { level: 1, name: /nace en pareja/i })).toBeInTheDocument()
    expect(await screen.findByText('131 de 131')).toBeInTheDocument()
    expect(screen.getByText('Conciliados · 0 sin pareja')).toBeInTheDocument()
    expect(screen.getAllByText('39')).toHaveLength(2)
    expect(screen.getAllByText('92').length).toBeGreaterThan(0)

    // La tabla y la lista móvil conviven en el DOM; el CSS muestra una.
    expect(screen.getAllByRole('link', { name: 'Ver documento IC-F1-2027-01' })[0]).toHaveAttribute('href', '/documentos/IC-F1-2027-01')
    expect(screen.getAllByText('GTQ 65,000').length).toBeGreaterThan(0)
    expect(screen.getAllByText('−78.43').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Dif. cambiaria').length).toBeGreaterThan(0)
    expect(screen.getByText('8 de 131')).toBeInTheDocument()
    expect(screen.getByText(/Tolerancia por documento: USD 50 o 2 %/)).toBeInTheDocument()

    expect(screen.getByRole('heading', { level: 2, name: 'Cada diferencia tiene nombre' })).toBeInTheDocument()
    expect(screen.getByText('Alerta: falta la factura en la otra')).toBeInTheDocument()
    expect(screen.getByText('Se elimina al consolidar')).toBeInTheDocument()
    expect(reconciliation.getReport).toHaveBeenCalledWith({ scenarioId: 'PPTO_V2', currency: 'USD' }, { type: undefined }, expect.anything())
  })

  it('filtra por tipo y lo guarda en la URL', async () => {
    const reconciliation = fakeRepo()
    renderWithProviders(<ReconciliationPage />, { repositories: { reconciliation }, route: '/conciliacion' })
    await screen.findByText('131 de 131')

    await userEvent.click(screen.getByRole('button', { name: 'Ventas' }))
    await waitFor(() => expect(reconciliation.getReport).toHaveBeenLastCalledWith(expect.anything(), { type: 'VENTA' }, expect.anything()))
    expect(screen.getByRole('button', { name: 'Ventas' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('lee el filtro inicial de ?tipo=', async () => {
    const reconciliation = fakeRepo()
    renderWithProviders(<ReconciliationPage />, { repositories: { reconciliation }, route: '/conciliacion?tipo=INTERES' })
    await screen.findByText('131 de 131')
    expect(reconciliation.getReport).toHaveBeenCalledWith(expect.anything(), { type: 'INTERES' }, expect.anything())
    expect(screen.getByRole('button', { name: 'Intereses' })).toHaveAttribute('aria-pressed', 'true')
  })
})
