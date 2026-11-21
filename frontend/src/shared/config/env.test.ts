import { describe, expect, it } from 'vitest'
import { readEnv } from './env'

describe('readEnv', () => {
  it('usa /api por defecto y quita la barra final', () => {
    expect(readEnv({}).apiUrl).toBe('/api')
    expect(readEnv({ VITE_API_URL: 'https://api.quadra.test/api/' }).apiUrl).toBe('https://api.quadra.test/api')
  })
  it('trata valores vacíos como ausentes', () => {
    const env = readEnv({ VITE_SUPABASE_URL: '  ', VITE_SUPABASE_ANON_KEY: '' })
    expect(env.supabaseUrl).toBeNull()
    expect(env.supabaseAnonKey).toBeNull()
  })
})
