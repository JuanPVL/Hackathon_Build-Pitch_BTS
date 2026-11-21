import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RepositoriesProvider } from '@/app/di'
import type { Repositories } from '@/app/di'
import { AuthProvider } from '@/shared/auth'

/**
 * Renderiza una página con dobles de los repositorios (inversión de dependencias).
 * Solo hace falta pasar los puertos que la página usa.
 */
export function renderWithProviders(ui: ReactElement, { repositories = {}, route = '/', path = '*' }: { repositories?: Partial<Repositories>; route?: string; path?: string } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <AuthProvider>
          <RepositoriesProvider repositories={repositories as Repositories}>
            <Routes><Route path={path} element={ui} /></Routes>
          </RepositoriesProvider>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
