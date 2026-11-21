/** Configuración pública del frontend. Único lugar que lee import.meta.env. */
export interface AppEnv {
  /** Base de la API de NestJS, sin barra final (por defecto `/api`). */
  apiUrl: string
  supabaseUrl: string | null
  supabaseAnonKey: string | null
}

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export function readEnv(source: Record<string, string | undefined> = import.meta.env): AppEnv {
  return {
    apiUrl: (clean(source.VITE_API_URL) ?? '/api').replace(/\/$/, ''),
    supabaseUrl: clean(source.VITE_SUPABASE_URL),
    supabaseAnonKey: clean(source.VITE_SUPABASE_ANON_KEY),
  }
}

export const env: AppEnv = readEnv()
