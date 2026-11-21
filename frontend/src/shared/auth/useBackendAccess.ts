import { useQuery } from '@tanstack/react-query'
import { useAuth } from './AuthProvider'
import { useBackend } from '@/shared/api/useBackend'

export function useBackendAccess() {
  const { session } = useAuth()
  const backend = useBackend()
  return useQuery({
    queryKey: ['access', session?.user.id],
    queryFn: ({ signal }) => backend.me(signal),
    enabled: !!session,
    retry: false,
  })
}
