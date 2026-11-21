import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { FullState } from '@/shared/ui'
import { useAuth } from './AuthProvider'

/**
 * Protege rutas del navegador. No reemplaza la autorización del servidor:
 * NestJS valida el JWT y los permisos en cada endpoint.
 */
export function ProtectedRoute({ children, allowUnconfiguredInDev = import.meta.env.DEV }: { children: ReactNode; allowUnconfiguredInDev?: boolean }) {
  const { session, loading, unconfigured } = useAuth()
  const location = useLocation()
  if (loading) return <FullState title="Recuperando sesión…" busy />
  if (unconfigured) {
    if (allowUnconfiguredInDev) return children
    return (
      <FullState title="Configura la conexión">
        Agrega VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY al entorno y reinicia la aplicación.
      </FullState>
    )
  }
  if (!session) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  return children
}
