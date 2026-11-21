import { describe, expect, it, vi } from 'vitest'
import { Backend, numberOf } from './backend'
import { createHttpClient } from './httpClient'

function setup() {
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ status: 'ok' }), { status: 200 }))
  return { fetchImpl, backend: new Backend(createHttpClient({ baseUrl: 'https://api.test/api', getAccessToken: async () => 'user-token', fetchImpl })) }
}
describe('contrato de operaciones del backend', () => {
  it('envía JWT y parámetros con nombres del OpenAPI', async () => {
    const { backend, fetchImpl } = setup()
    await backend.loads('PPTO_V1')
    const [url, options] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.test/api/loads?scenarioId=PPTO_V1')
    expect(new Headers(options.headers).get('Authorization')).toBe('Bearer user-token')
  })
  it('acepta y disputa usando id y versión explícita', async () => {
    const { backend, fetchImpl } = setup()
    await backend.acceptDocument('IC-F1-2027-12', 3)
    await backend.disputeDocument('IC-F1-2027-12', 3, 'Diferencia de importe')
    const calls = fetchImpl.mock.calls as unknown as [string, RequestInit][]
    expect(calls[0][0]).toBe('https://api.test/api/ic-documents/IC-F1-2027-12/accept')
    expect(JSON.parse(String(calls[0][1].body))).toEqual({ version: 3 })
    expect(calls[1][0]).toBe('https://api.test/api/ic-documents/IC-F1-2027-12/dispute')
    expect(JSON.parse(String(calls[1][1].body))).toEqual({ version: 3, reason: 'Diferencia de importe' })
  })
  it('consolida solo mediante una acción POST explícita', async () => {
    const { backend, fetchImpl } = setup()
    await backend.consolidate('PPTO_V2')
    const [url, options] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.test/api/scenarios/PPTO_V2/consolidate')
    expect(options.method).toBe('POST')
  })
  it('normaliza decimales sin convertir NULL a cero', () => {
    expect(numberOf('1234.56')).toBe(1234.56)
    expect(Number.isNaN(numberOf(null))).toBe(true)
    expect(() => numberOf('dato incorrecto')).toThrow('numérico inválido')
  })
})
