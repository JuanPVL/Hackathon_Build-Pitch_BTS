import { CircleAlert, CircleCheck } from 'lucide-react'
import { Chip } from '@/shared/ui'
import { pluralFindings } from '../domain/validation'
import { useValidationReport } from '../hooks/useValidationReport'

/** Estado de publicación del grupo en la barra superior: lo que dice el validador, nada más. */
export function PublicationStatus() {
  const { data, isPending, isError } = useValidationReport()
  if (isPending || isError || !data) return <Chip tone="neutral" icon={CircleAlert}>Estado no disponible</Chip>
  if (data.publishable) return <Chip tone="ok" icon={CircleCheck}>0 hallazgos · linaje cuadra</Chip>
  return <Chip tone="err" icon={CircleAlert}>{pluralFindings(data.findings.length)} · no se publica</Chip>
}
