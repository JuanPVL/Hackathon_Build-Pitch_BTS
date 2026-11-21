import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import type { Repositories } from './repositories'

const RepositoriesContext = createContext<Repositories | null>(null)

/** Inyecta las implementaciones de los puertos. Las pruebas pasan dobles aquí. */
export function RepositoriesProvider({ repositories, children }: { repositories: Repositories; children: ReactNode }) {
  return <RepositoriesContext.Provider value={repositories}>{children}</RepositoriesContext.Provider>
}

/** Devuelve el repositorio de un módulo. Los hooks de cada feature lo usan; las páginas no. */
export function useRepository<K extends keyof Repositories>(key: K): Repositories[K] {
  const repositories = useContext(RepositoriesContext)
  if (!repositories) throw new Error('useRepository debe usarse dentro de <RepositoriesProvider>.')
  return repositories[key]
}
