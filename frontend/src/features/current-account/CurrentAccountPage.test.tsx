import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import CurrentAccountPage from './CurrentAccountPage'
import { gt1Mx1Pair, saldoMatrix } from './current-account.fixtures'
import type { CurrentAccountRepository } from './ports/CurrentAccountRepository'
import type { BalanceMatrix } from './domain/types'

function fakeRepo(matrix: BalanceMatrix = saldoMatrix) {
  return {
    getMatrix: vi.fn().mockResolvedValue(matrix),
    getPair: vi.fn().mockResolvedValue(gt1Mx1Pair),
  } satisfies CurrentAccountRepository
}

const original = window.matchMedia
function setMobile(isMobile: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: isMobile && query.includes('767'), media: query, onchange: null,
    addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia
}
afterEach(() => { window.matchMedia = original })

describe('CurrentAccountPage · escritorio', () => {
  it('muestra la matriz accesible con saldos con signo y estado', async () => {
    const currentAccount = fakeRepo()
    renderWithProviders(<CurrentAccountPage />, { repositories: { currentAccount }, route: '/cuenta-corriente' })

    expect(screen.getByRole('heading', { level: 1, name: 'Cuenta corriente entre empresas' })).toBeInTheDocument()
    const table = await screen.findByRole('table', { name: /Saldos IC al cierre/ })
    expect(within(table).getAllByRole('columnheader')).toHaveLength(7)
    expect(within(table).getAllByRole('rowheader')).toHaveLength(6)

    const gt1Mx1 = within(table).getByRole('button', { name: 'GT1 con MX1: +8,333 USD, Conciliado FX' })
    expect(gt1Mx1).toHaveTextContent('+8,333')
    expect(within(table).getByRole('button', { name: /^MX1 con GT1: −8,412 USD/ })).toHaveTextContent('−8,412')
    expect(within(table).getByRole('button', { name: /^GT1 con GT2: −5,000 USD, Exacto/ })).toHaveTextContent('exacto')
    expect(within(table).getByText('GT1 con GT1: no aplica')).toBeInTheDocument()
    expect(screen.getByText(/La matriz es antisimétrica/)).toBeInTheDocument()

    // Totales y panel vacío.
    expect(screen.getByText('131')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Elige una celda' })).toBeInTheDocument()
    expect(currentAccount.getPair).not.toHaveBeenCalled()
  })

  it('al seleccionar una celda abre el detalle del par con las patas espejo y los documentos', async () => {
    const currentAccount = fakeRepo()
    renderWithProviders(<CurrentAccountPage />, { repositories: { currentAccount }, route: '/cuenta-corriente' })
    const table = await screen.findByRole('table', { name: /Saldos IC al cierre/ })

    await userEvent.click(within(table).getByRole('button', { name: /^GT1 con MX1/ }))

    const panel = await screen.findByRole('region', { name: 'Detalle del par GT1 con MX1' })
    expect(within(panel).getByRole('heading', { level: 2, name: 'GT1 ↔ MX1' })).toBeInTheDocument()
    expect(await within(panel).findByText('Cuenta por cobrar')).toBeInTheDocument()
    expect(within(panel).getByText('Cuenta por pagar espejo')).toBeInTheDocument()
    expect(within(panel).getByText('Saldo del par USD 8,333')).toBeInTheDocument()
    expect(within(panel).getByText('Saldo espejo USD 8,412')).toBeInTheDocument()
    expect(within(panel).getByText('USD −78.43')).toBeInTheDocument()
    expect(within(panel).getByRole('heading', { level: 3, name: '12 documentos del par' })).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: 'Ver documento IC-F1-2027-04' })).toHaveAttribute('href', '/documentos/IC-F1-2027-04')
    expect(within(panel).getByRole('link', { name: 'Ver documento y linaje' })).toHaveAttribute('href', '/documentos/IC-F1-2027-01')
    expect(currentAccount.getPair).toHaveBeenCalledWith({ scenarioId: 'PPTO_V2', currency: 'USD' }, 'GT1', 'MX1', expect.anything())
    expect(within(table).getByRole('button', { name: /^GT1 con MX1/ })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(within(panel).getByRole('button', { name: 'Cerrar detalle del par' }))
    expect(await screen.findByRole('heading', { level: 2, name: 'Elige una celda' })).toBeInTheDocument()
  })

  it('permite elegir una celda con el teclado y moverse con flechas', async () => {
    const currentAccount = fakeRepo()
    renderWithProviders(<CurrentAccountPage />, { repositories: { currentAccount }, route: '/cuenta-corriente' })
    const table = await screen.findByRole('table', { name: /Saldos IC al cierre/ })

    const first = within(table).getByRole('button', { name: /^GT1 con GT2/ })
    first.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(within(table).getByRole('button', { name: /^GT1 con MX1/ })).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(await screen.findByRole('region', { name: 'Detalle del par GT1 con MX1' })).toBeInTheDocument()
    await userEvent.keyboard('{ArrowDown}')
    // Salta las celdas sin saldo y la diagonal hasta la siguiente celda abrible de la columna.
    expect(within(table).getByRole('button', { name: /^MX2 con MX1/ })).toHaveFocus()
  })

  it('abre el par indicado en ?par= y respeta la vista', async () => {
    const currentAccount = fakeRepo({ ...saldoMatrix, view: 'facturado' })
    renderWithProviders(<CurrentAccountPage />, { repositories: { currentAccount }, route: '/cuenta-corriente?vista=facturado&par=GT1-MX1' })
    expect(await screen.findByRole('table', { name: /Facturado entre empresas/ })).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'Detalle del par GT1 con MX1' })).toBeInTheDocument()
    expect(currentAccount.getMatrix).toHaveBeenCalledWith(expect.anything(), 'facturado', expect.anything())
    expect(screen.getByRole('button', { name: 'Facturado' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText(/La matriz es antisimétrica/)).not.toBeInTheDocument()
  })

  it('avisa cuando la matriz no es antisimétrica', async () => {
    const broken: BalanceMatrix = { ...saldoMatrix, cells: saldoMatrix.cells.map(c => c.company === 'GT1' && c.counterparty === 'GT2' ? { ...c, balanceUsd: -9000 } : c) }
    renderWithProviders(<CurrentAccountPage />, { repositories: { currentAccount: fakeRepo(broken) }, route: '/cuenta-corriente' })
    expect(await screen.findByText(/La matriz no es antisimétrica/)).toBeInTheDocument()
    expect(screen.getByText(/GT1 ↔ GT2/)).toBeInTheDocument()
  })
})

describe('CurrentAccountPage · móvil', () => {
  it('no muestra la matriz: selector de empresa, saldo neto y socios', async () => {
    setMobile(true)
    const currentAccount = fakeRepo()
    renderWithProviders(<CurrentAccountPage />, { repositories: { currentAccount }, route: '/cuenta-corriente' })

    expect(await screen.findByRole('group', { name: 'Empresa que reporta' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Empresa que reporta' })).getAllByRole('button')).toHaveLength(6)

    expect(screen.getByText('−4,119 USD')).toBeInTheDocument()
    expect(screen.getByText('Le deben 8,333 · debe 12,452 · 3 socios con saldo')).toBeInTheDocument()
    const partners = screen.getByRole('list')
    const items = within(partners).getAllByRole('button')
    expect(items.map(b => b.getAttribute('aria-label')?.slice(0, 3))).toEqual(['MX1', 'US2', 'GT2'])
  })

  it('al tocar un socio abre el detalle del par; cambiar de empresa cambia los socios', async () => {
    setMobile(true)
    const currentAccount = fakeRepo()
    renderWithProviders(<CurrentAccountPage />, { repositories: { currentAccount }, route: '/cuenta-corriente' })
    await screen.findByRole('group', { name: 'Empresa que reporta' })

    await userEvent.click(screen.getByRole('button', { name: /^MX1 Alfa México, Conciliado FX, \+8,333 USD/ }))
    const panel = await screen.findByRole('region', { name: 'Detalle del par GT1 con MX1' })
    expect(await within(panel).findByText('Cuenta por cobrar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^MX1 Alfa México/ })).toHaveAttribute('aria-expanded', 'true')

    await userEvent.click(screen.getByRole('button', { name: 'MX2' }))
    expect(screen.getByText('Gamma México · Saldo neto IC')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /Detalle del par/ })).not.toBeInTheDocument()
  })
})
