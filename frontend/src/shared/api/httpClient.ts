/** Error de la API con el estado HTTP. `status = 0` significa falla de red o tiempo agotado. */
export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
  get isNotFound() { return this.status === 404 }
  get isForbidden() { return this.status === 401 || this.status === 403 }
  get isNetwork() { return this.status === 0 }
  /** El servidor o su proxy no está disponible (502/503/504). */
  get isUnavailable() { return this.status === 502 || this.status === 503 || this.status === 504 }
}

/** Contrato que consumen los adaptadores de cada módulo (inversión de dependencias). */
export interface HttpClient {
  get<T>(path: string, options?: RequestOptions): Promise<T>
  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>
  patch?<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>
}

export interface RequestOptions {
  query?: Record<string, string | number | undefined>
  signal?: AbortSignal
}

export interface HttpClientConfig {
  baseUrl: string
  /** Devuelve el JWT vigente o null si no hay sesión. */
  getAccessToken: () => Promise<string | null>
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

export function buildPath(path: string, query?: RequestOptions['query']): string {
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error('La ruta API debe ser relativa.')
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) if (value !== undefined) params.set(key, String(value))
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

export function createHttpClient({ baseUrl, getAccessToken, timeoutMs = 30000, fetchImpl }: HttpClientConfig): HttpClient {
  const doFetch = fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args))

  async function request<T>(method: string, path: string, body: unknown, options: RequestOptions = {}): Promise<T> {
    const headers = new Headers({ Accept: 'application/json' })
    const isForm = body instanceof FormData
    if (body !== undefined && !isForm) headers.set('Content-Type', 'application/json')
    const token = await getAccessToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)

    // El timeout aplica siempre, también cuando el llamador (TanStack Query) pasa su propia señal.
    const timeout = AbortSignal.timeout(timeoutMs)
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout

    let response: Response
    try {
      response = await doFetch(`${baseUrl}${buildPath(path, options.query)}`, {
        method,
        headers,
        body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
        signal,
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError' && options.signal?.aborted) throw error
      throw new ApiError(0, 'No se pudo conectar con el servidor.')
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      const message = Array.isArray(payload?.message) ? payload.message.join(', ') : payload?.message
      throw new ApiError(response.status, typeof message === 'string' ? message : `Error del servidor (${response.status})`)
    }
    // 204 o 200 sin cuerpo (p. ej. una acción que solo confirma) devuelven undefined.
    const text = await response.text()
    return (text ? JSON.parse(text) : undefined) as T
  }

  return {
    get: (path, options) => request('GET', path, undefined, options),
    post: (path, body, options) => request('POST', path, body, options),
    patch: (path, body, options) => request('PATCH', path, body, options),
  }
}
