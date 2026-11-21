import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'

export interface AuthState {
  session: Session | null
  loading: boolean
  error: string | null
  /** true cuando faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. */
  unconfigured: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<string | null>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next); setLoading(false)
    })
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setError('No se pudo recuperar la sesión. Intenta ingresar de nuevo.')
      setSession(data.session); setLoading(false)
    }).catch(() => { setError('No se pudo recuperar la sesión.'); setLoading(false) })
    return () => subscription.unsubscribe()
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return 'Configura las variables de Supabase para habilitar el acceso.'
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      return error ? 'No se pudo iniciar sesión. Revisa tus credenciales e inténtalo nuevamente.' : null
    } catch {
      return 'No se pudo conectar. Revisa tu conexión e inténtalo de nuevo.'
    }
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return null
    const { error } = await supabase.auth.signOut()
    return error ? 'No se pudo cerrar sesión. Intenta nuevamente.' : null
  }, [])

  const value = useMemo<AuthState>(
    () => ({ session, loading, error, unconfigured: !supabase, signIn, signOut }),
    [session, loading, error, signIn, signOut],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>.')
  return ctx
}
