import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Navigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const AuthContext = createContext<{ session: Session | null; loading: boolean; error: string | null }>({ session: null, loading: true, error: null })

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
  return <AuthContext.Provider value={{ session, loading, error }}>{children}</AuthContext.Provider>
}
export const useAuth = () => useContext(AuthContext)

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="full-state" role="status">Recuperando sesión…</div>
  if (!supabase) return <div className="full-state"><div className="card"><h1>Configura la conexión</h1><p>Agrega VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY al entorno y reinicia la aplicación.</p><p>La base del frontend está lista. Se requiere configuración para iniciar sesión.</p></div></div>
  if (!session) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  return children
}
