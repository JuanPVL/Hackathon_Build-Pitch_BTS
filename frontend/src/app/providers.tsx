import { useState } from 'react'
import type { ReactNode } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createHttpClient } from '@/shared/api/httpClient'
import { ApiError } from '@/shared/api/httpClient'
import { AuthProvider, getAccessToken } from '@/shared/auth'
import { env } from '@/shared/config/env'
import { RepositoriesProvider, createHttpRepositories } from './di'
import type { Repositories } from './di'

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // No reintenta errores definitivos (sin permiso, no existe).
        retry: (count, error) => !(error instanceof ApiError && (error.isForbidden || error.isNotFound)) && count < 1,
      },
    },
  })
}

/** Proveedores de la app. `repositories` permite inyectar otra implementación (pruebas). */
export function AppProviders({ children, repositories }: { children: ReactNode; repositories?: Repositories }) {
  const [queryClient] = useState(createQueryClient)
  const [repos] = useState(() => repositories ?? createHttpRepositories(createHttpClient({ baseUrl: env.apiUrl, getAccessToken })))
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <RepositoriesProvider repositories={repos}>{children}</RepositoriesProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
