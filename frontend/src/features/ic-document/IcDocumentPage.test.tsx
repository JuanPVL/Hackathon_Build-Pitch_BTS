import { describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { ApiError } from '@/shared/api/httpClient'
import IcDocumentPage from './IcDocumentPage'
import { documentF1_12 } from './ic-document.fixtures'
import type { IcDocumentRepository } from './ports/IcDocumentRepository'

const render = (icDocument: IcDocumentRepository, key = 'IC-F1-2027-12') =>
  renderWithProviders(<IcDocumentPage />, { repositories: { icDocument }, route: `/documentos/${key}`, path: '/documentos/:key' })

describe('IcDocumentPage', () => {
  it('muestra cabecera, patas espejo, linaje, vida del documento y versiones', async () => {
    const icDocument = { getDocument: vi.fn().mockResolvedValue(documentF1_12) } satisfies IcDocumentRepository
    render(icDocument)

    expect(await screen.findByRole('heading', { level: 1, name: 'IC-F1-2027-12 · Venta GT1 → MX1' })).toBeInTheDocument()
    expect(icDocument.getDocument).toHaveBeenCalledWith('IC-F1-2027-12', 'PPTO_V2', expect.anything())
    expect(screen.getByText('Diferencia cambiaria · conciliado')).toBeInTheDocument()

    // Migas y enlace de vuelta.
    const crumbs = screen.getByRole('navigation', { name: 'Migas de pan' })
    expect(within(crumbs).getByRole('link', { name: 'Cuenta corriente' })).toHaveAttribute('href', '/cuenta-corriente')
    expect(within(crumbs).getByRole('link', { name: 'GT1 con MX1' })).toHaveAttribute('href', '/cuenta-corriente?par=GT1-MX1')
    expect(within(crumbs).getByText('IC-F1-2027-12')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Volver a GT1 con MX1' })).toBeInTheDocument()

    // Patas espejo.
    expect(screen.getByText('Cuenta por cobrar')).toBeInTheDocument()
    expect(screen.getByText('Cuenta por pagar espejo')).toBeInTheDocument()
    expect(screen.getAllByText('GTQ 65,000')).toHaveLength(2)
    expect(screen.getByText('USD 8,333.33 · tasa del grupo 7.80 GTQ/USD')).toBeInTheDocument()
    expect(screen.getByText(/USD 8,411\.77 · via MXN 157,300/)).toBeInTheDocument()
    expect(screen.getByText('Conciliado FX')).toBeInTheDocument()

    // Linaje.
    const lineage = screen.getByRole('list', { name: 'Cadena de linaje de la cifra' })
    expect(within(lineage).getAllByRole('listitem').filter(li => li.getAttribute('aria-hidden') !== 'true')).toHaveLength(4)
    expect(within(lineage).getByText('BALANCE_GT1_V2.CSV · FILA 8')).toBeInTheDocument()
    expect(within(lineage).getByText('USD 8,333')).toBeInTheDocument()
    expect(screen.getByText('Σ aportes = cifra')).toBeInTheDocument()

    // Vida del documento.
    const life = screen.getByRole('list', { name: 'Estados del documento' })
    expect(within(life).getByText('Conciliada').closest('li')).toHaveAttribute('aria-current', 'step')
    expect(within(life).getAllByRole('listitem')).toHaveLength(5)

    // Versiones y autores.
    expect(screen.getByRole('heading', { level: 2, name: 'Versiones y autores' })).toBeInTheDocument()
    expect(screen.getAllByText('Contador MX1').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('avisa si el linaje no cuadra', async () => {
    const icDocument = { getDocument: vi.fn().mockResolvedValue({ ...documentF1_12, lineageOk: false }) } satisfies IcDocumentRepository
    render(icDocument)
    expect(await screen.findByText('Σ aportes ≠ cifra')).toBeInTheDocument()
  })

  it('muestra el estado vacío con enlace para volver cuando la llave no existe (404)', async () => {
    const icDocument = { getDocument: vi.fn().mockRejectedValue(new ApiError(404, 'No existe')) } satisfies IcDocumentRepository
    render(icDocument, 'IC-X-0000')

    expect(await screen.findByRole('heading', { level: 2, name: 'No encontramos este documento' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Documento y linaje' })).toBeInTheDocument()
    expect(screen.getByText(/no existe en este escenario/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver a Cuenta corriente' })).toHaveAttribute('href', '/cuenta-corriente')
    expect(icDocument.getDocument).toHaveBeenCalledTimes(1)
  })
})
