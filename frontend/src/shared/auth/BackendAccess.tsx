import type { ReactNode } from 'react'
import { useAuth } from './AuthProvider'
import { useBackendAccess } from './useBackendAccess'
import { Button, FullState } from '@/shared/ui'
import { ApiError } from '@/shared/api/httpClient'

export function BackendAccess({ children }: { children: ReactNode }) {
  const { session, signOut } = useAuth()
  const query = useBackendAccess()
  if (!session) return children
  if (query.isPending) return <FullState title="Verificando acceso al grupo…" busy />
  if (query.isError) {
    const expired = query.error instanceof ApiError && query.error.status === 401
    return <FullState title={expired ? 'Tu sesión no es válida para la API' : 'No pudimos verificar tu acceso'}
      action={<><Button onClick={() => query.refetch()}>Reintentar</Button><Button onClick={() => signOut()}>Volver al login</Button></>}>
      {expired ? 'Inicia sesión nuevamente para continuar.' : query.error.message}
    </FullState>
  }
  if (!query.data?.grants.length) return <FullState title="Tu cuenta aún no tiene acceso"
    action={<Button onClick={() => signOut()}>Cerrar sesión</Button>}>
    Solicita al administrador un rol y las empresas que te corresponden.
  </FullState>
  return children
}
