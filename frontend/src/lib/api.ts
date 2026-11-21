import { supabase } from './supabase'

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = 'ApiError' }
}

const baseUrl = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')

// Endpoint paths belong in feature services once the NestJS contract is available.
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error('La ruta API debe ser relativa.')
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  if (supabase) {
    const { data, error } = await supabase.auth.getSession()
    if (error) throw error
    if (data.session) headers.set('Authorization', `Bearer ${data.session.access_token}`)
  }
  const response = await fetch(`${baseUrl}${path}`, {
    ...options, headers, signal: options.signal ?? AbortSignal.timeout(30000),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message
    throw new ApiError(response.status, typeof message === 'string' ? message : `Error del servidor (${response.status})`)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}
