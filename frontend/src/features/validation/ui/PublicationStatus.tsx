import { CircleCheck } from 'lucide-react'
import { Chip } from '@/shared/ui'

/** Estado del grupo en la barra superior. Provisional: lo implementa la fase 3. */
export function PublicationStatus() {
  return <Chip tone="neutral" icon={CircleCheck}>Estado no disponible</Chip>
}
