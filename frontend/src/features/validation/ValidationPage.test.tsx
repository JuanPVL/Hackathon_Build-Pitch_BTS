import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { ApiError } from '@/shared/api/httpClient'
import type { ValidationRepository } from './ports/ValidationRepository'
import { buildReport } from './report.fixture'
import ValidationPage from './ValidationPage'

function fakeRepo(overrides: Partial<ValidationRepository> = {}): ValidationRepository {
  return {
    getReport: vi.fn().mockResolvedValue(buildReport()),
    acceptCorrection: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('ValidationPage', () => {
  it('muestra encabezado, cargas y hallazgos ordenados por impacto con cifras formateadas', async () => {
    renderWithProviders(<ValidationPage />, { repositories: { validation: fakeRepo() }, route: '/?esc=PPTO_V1' })
    expect(await screen.findByRole('heading', { level: 1, name: 'Carga y validación' })).toBeInTheDocument()
    expect(screen.getByText('PASO 1 · VALIDAR · PRESUPUESTO 2027 · V1')).toBeInTheDocument()
    expect(await screen.findByRole('list', { name: 'Cargas por empresa' })).toBeInTheDocument()
    expect(screen.getByText('GT1')).toBeInTheDocument()

    const table = await screen.findByRole('table')
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(10)
    expect(within(rows[0]).getByText('V08')).toBeInTheDocument()
    expect(within(rows[0]).getByText('285,964,670')).toBeInTheDocument()
    expect(within(rows[1]).getByText('59,940,000')).toBeInTheDocument()
    expect(screen.getByText('3 bloqueantes')).toBeInTheDocument()
    expect(screen.getByText('11 advertencias')).toBeInTheDocument()
  })

  it('limita a 10 y expande con "Ver los N restantes"', async () => {
    renderWithProviders(<ValidationPage />, { repositories: { validation: fakeRepo() } })
    await screen.findByRole('table')
    await userEvent.click(screen.getByRole('button', { name: 'Ver los 4 restantes' }))
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(15)
    expect(screen.queryByRole('button', { name: /restantes/ })).not.toBeInTheDocument()
  })

  it('selecciona un hallazgo y muestra su detalle', async () => {
    renderWithProviders(<ValidationPage />, { repositories: { validation: fakeRepo() } })
    const detail = await screen.findByLabelText('Detalle del hallazgo')
    expect(within(detail).getByText('18.0000')).toBeInTheDocument()
    expect(within(detail).getByText('USD 285,964,670')).toBeInTheDocument()
    await userEvent.click(within(screen.getByRole('table')).getByText('V02'))
    expect(within(screen.getByLabelText('Detalle del hallazgo')).getByText('USD 850,000')).toBeInTheDocument()
    expect(within(screen.getByLabelText('Detalle del hallazgo')).queryByRole('button', { name: 'Aceptar corrección sugerida' })).not.toBeInTheDocument()
  })

  it('exige justificación antes de aceptar la corrección y llama a la mutación con id y texto', async () => {
    const repo = fakeRepo()
    renderWithProviders(<ValidationPage />, { repositories: { validation: repo } })
    await userEvent.click(await screen.findByRole('button', { name: 'Aceptar corrección sugerida' }))

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar corrección' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('La justificación es obligatoria')
    expect(repo.acceptCorrection).not.toHaveBeenCalled()

    await userEvent.type(screen.getByLabelText('Justificación (obligatoria)'), 'Tasa invertida confirmada con tesorería')
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar corrección' }))
    await waitFor(() => expect(repo.acceptCorrection).toHaveBeenCalledWith('F-V08', 'Tasa invertida confirmada con tesorería'))
    expect(await screen.findByText('Corrección de V08 aceptada.')).toBeInTheDocument()
  })

  it('muestra el error de la mutación en la interfaz', async () => {
    const repo = fakeRepo({ acceptCorrection: vi.fn().mockRejectedValue(new ApiError(500, 'Fallo del servidor')) })
    renderWithProviders(<ValidationPage />, { repositories: { validation: repo } })
    await userEvent.click(await screen.findByRole('button', { name: 'Aceptar corrección sugerida' }))
    await userEvent.type(screen.getByLabelText('Justificación (obligatoria)'), 'Motivo')
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar corrección' }))
    expect(await screen.findByText('Fallo del servidor')).toBeInTheDocument()
  })

  it('Actualizar vuelve a consultar y "Subir archivos" está deshabilitado', async () => {
    const repo = fakeRepo()
    renderWithProviders(<ValidationPage />, { repositories: { validation: repo } })
    await screen.findByRole('table')
    expect(screen.getByRole('button', { name: 'Subir archivos' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Subir archivos' })).toHaveAttribute('title', 'Próximamente')
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar' }))
    await waitFor(() => expect(repo.getReport).toHaveBeenCalledTimes(2))
  })

  it('404 → estado vacío', async () => {
    const repo = fakeRepo({ getReport: vi.fn().mockRejectedValue(new ApiError(404, 'No existe')) })
    renderWithProviders(<ValidationPage />, { repositories: { validation: repo } })
    expect(await screen.findByText('Sin validación disponible')).toBeInTheDocument()
  })
})
