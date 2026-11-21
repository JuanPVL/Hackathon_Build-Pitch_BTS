import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRepository } from '@/app/di/RepositoriesProvider'

export interface AcceptCorrectionInput { findingId: string; justification: string }

/** Acepta la corrección sugerida (queda auditada con autor y motivo) y refresca la validación. */
export function useAcceptCorrection() {
  const repo = useRepository('validation')
  const queryClient = useQueryClient()
  return useMutation<void, Error, AcceptCorrectionInput>({
    mutationFn: ({ findingId, justification }) => repo.acceptCorrection(findingId, justification),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['validation'] }),
  })
}
