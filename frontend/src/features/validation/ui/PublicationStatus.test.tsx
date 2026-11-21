import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { ApiError } from '@/shared/api/httpClient'
import type { ValidationRepository } from '../ports/ValidationRepository'
import { buildReport } from '../report.fixture'
import { PublicationStatus } from './PublicationStatus'

const repo = (getReport: ValidationRepository['getReport']): ValidationRepository => ({ getReport, acceptCorrection: vi.fn() })

describe('PublicationStatus', () => {
  it('publicable → "0 hallazgos · linaje cuadra"', async () => {
    renderWithProviders(<PublicationStatus />, { repositories: { validation: repo(vi.fn().mockResolvedValue(buildReport({ publishable: true, findings: [] }))) } })
    expect(await screen.findByText('0 hallazgos · linaje cuadra')).toBeInTheDocument()
  })

  it('no publicable → "N hallazgos · no se publica"', async () => {
    renderWithProviders(<PublicationStatus />, { repositories: { validation: repo(vi.fn().mockResolvedValue(buildReport())) } })
    expect(await screen.findByText('14 hallazgos · no se publica')).toBeInTheDocument()
  })

  it('cargando → "Estado no disponible"', () => {
    renderWithProviders(<PublicationStatus />, { repositories: { validation: repo(() => new Promise(() => {})) } })
    expect(screen.getByText('Estado no disponible')).toBeInTheDocument()
  })

  it('error → "Estado no disponible"', async () => {
    renderWithProviders(<PublicationStatus />, { repositories: { validation: repo(vi.fn().mockRejectedValue(new ApiError(500, 'x'))) } })
    expect(await screen.findByText('Estado no disponible')).toBeInTheDocument()
  })
})
