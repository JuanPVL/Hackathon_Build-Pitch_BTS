import { describe, expect, it, vi } from 'vitest'
import { ApiError, buildPath, createHttpClient } from './httpClient'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('buildPath', () => {
  it('agrega solo los parámetros definidos', () => {
    expect(buildPath('/x', { a: 'PPTO_V2', b: undefined, c: 3 })).toBe('/x?a=PPTO_V2&c=3')
  })
  it('rechaza rutas absolutas o de otro origen', () => {
    expect(() => buildPath('https://evil.test')).toThrow()
    expect(() => buildPath('//evil.test')).toThrow()
  })
})

describe('createHttpClient', () => {
  it('envía el JWT y concatena la base', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ ok: true }))
    const http = createHttpClient({ baseUrl: '/api', getAccessToken: async () => 'tok', fetchImpl })
    await expect(http.get('/scenarios/PPTO_V2/rates')).resolves.toEqual({ ok: true })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('/api/scenarios/PPTO_V2/rates')
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer tok')
    expect(init.method).toBe('GET')
  })

  it('no envía Authorization sin sesión', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({}))
    await createHttpClient({ baseUrl: '', getAccessToken: async () => null, fetchImpl }).get('/x')
    expect((fetchImpl.mock.calls[0][1].headers as Headers).has('Authorization')).toBe(false)
  })

  it('serializa el cuerpo JSON en POST', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    const http = createHttpClient({ baseUrl: '', getAccessToken: async () => null, fetchImpl })
    await expect(http.post('/v', { justification: 'ok' })).resolves.toBeUndefined()
    const init = fetchImpl.mock.calls[0][1]
    expect(init.body).toBe('{"justification":"ok"}')
    expect((init.headers as Headers).get('Content-Type')).toBe('application/json')
  })

  it('aplica el timeout aunque el llamador pase su propia señal', async () => {
    const fetchImpl = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_, reject) => {
      init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'TimeoutError')))
    }))
    const http = createHttpClient({ baseUrl: '', getAccessToken: async () => null, fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 20 })
    const error = await http.get('/lento', { signal: new AbortController().signal }).catch((e: ApiError) => e) as ApiError
    expect(error).toBeInstanceOf(ApiError)
    expect(error.isNetwork).toBe(true)
  })

  it('acepta 200 sin cuerpo', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 200 }))
    await expect(createHttpClient({ baseUrl: '', getAccessToken: async () => null, fetchImpl }).post('/accion')).resolves.toBeUndefined()
  })

  it('convierte respuestas de error en ApiError con el mensaje del backend', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ message: ['campo a', 'campo b'] }, 400))
    const error = await createHttpClient({ baseUrl: '', getAccessToken: async () => null, fetchImpl }).get('/x').catch((e: ApiError) => e) as ApiError
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(400)
    expect(error.message).toBe('campo a, campo b')
  })

  it('clasifica 404, 403 y fallas de red', async () => {
    const make = (impl: typeof fetch) => createHttpClient({ baseUrl: '', getAccessToken: async () => null, fetchImpl: impl })
    const notFound = await make(vi.fn().mockResolvedValue(json({}, 404))).get('/x').catch((e: ApiError) => e) as ApiError
    const forbidden = await make(vi.fn().mockResolvedValue(json({}, 403))).get('/x').catch((e: ApiError) => e) as ApiError
    const offline = await make(vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))).get('/x').catch((e: ApiError) => e) as ApiError
    expect(notFound.isNotFound).toBe(true)
    expect(forbidden.isForbidden).toBe(true)
    expect(offline.isNetwork).toBe(true)
    const gateway = await make(vi.fn().mockResolvedValue(json({}, 502))).get('/x').catch((e: ApiError) => e) as ApiError
    expect(gateway.isUnavailable).toBe(true)
  })
})
