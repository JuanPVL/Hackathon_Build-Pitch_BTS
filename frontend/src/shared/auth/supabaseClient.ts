import { createClient } from '@supabase/supabase-js'
import { env } from '@/shared/config/env'

/** Cliente de Supabase Auth, o null si faltan las variables públicas. */
export const supabase = env.supabaseUrl && env.supabaseAnonKey
  ? createClient(env.supabaseUrl, env.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null

/** JWT vigente para el backend; null sin sesión o sin configuración. */
export async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data.session?.access_token ?? null
}
