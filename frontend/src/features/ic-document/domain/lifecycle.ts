import type { StepState } from '@/shared/ui'
import type { DocumentEvent, IcDocumentDetail } from './types'

export interface LifecycleStep {
  label: string
  state: StepState
  /** Autor y descripción del evento que cerró el paso, si existe. */
  actor?: string
  detail?: string
}

/** Estado de un paso del ciclo de vida: el actual, los alcanzados (hechos) y los pendientes. */
export function stepState(step: { reached: boolean; current: boolean }): StepState {
  if (step.current) return 'current'
  return step.reached ? 'done' : 'pending'
}

const norm = (text: string) => text.trim().toLowerCase()

/** Une cada paso del ciclo de vida con el evento del mismo nombre (autor y detalle). */
export function lifecycleSteps(lifecycle: IcDocumentDetail['lifecycle'], events: DocumentEvent[]): LifecycleStep[] {
  return lifecycle.map(step => {
    const event = events.find(e => norm(e.event) === norm(step.label))
    return { label: step.label, state: stepState(step), actor: event?.actor, detail: event?.detail }
  })
}

/** Paso actual del ciclo de vida (o el último alcanzado si ninguno viene marcado). */
export function currentStep(lifecycle: IcDocumentDetail['lifecycle']): IcDocumentDetail['lifecycle'][number] | undefined {
  return lifecycle.find(s => s.current) ?? [...lifecycle].reverse().find(s => s.reached)
}
