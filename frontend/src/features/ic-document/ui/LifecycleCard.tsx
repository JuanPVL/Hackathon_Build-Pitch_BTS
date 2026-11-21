import { ShieldCheck } from 'lucide-react'
import { Card, CardHeader, Stepper } from '@/shared/ui'
import type { StepItem } from '@/shared/ui'
import { lifecycleSteps } from '../domain/lifecycle'
import type { IcDocumentDetail } from '../domain/types'
import s from './LifecycleCard.module.css'

/** "Vida del documento": estados del ciclo con el actual marcado. */
export function LifecycleCard({ doc }: { doc: Pick<IcDocumentDetail, 'lifecycle' | 'events'> }) {
  const steps: StepItem[] = lifecycleSteps(doc.lifecycle, doc.events).map(step => ({
    label: step.label,
    state: step.state,
    // El autor y el detalle se muestran en móvil (stepper vertical); en pantallas anchas viven en "Versiones y autores".
    detail: step.state === 'pending'
      ? <span className={s.mobileOnly}>Pendiente</span>
      : step.actor || step.detail ? <span className={s.mobileOnly}>{[step.actor, step.detail].filter(Boolean).join(' · ')}</span> : undefined,
  }))
  return (
    <Card>
      <CardHeader title="Vida del documento" />
      <Stepper steps={steps} label="Estados del documento" />
      <p className={s.rules}>
        <ShieldCheck size={16} aria-hidden />
        <span>Reglas que el sistema hace cumplir: ninguna factura se borra, se anula con nota de crédito que también nace en pareja · no se cierra el mes con facturas del grupo sin aceptar · cada cambio guarda versión y autor.</span>
      </p>
    </Card>
  )
}
