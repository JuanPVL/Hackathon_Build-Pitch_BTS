import { Fragment } from 'react'
import type { ReactNode } from 'react'
import { Check, Equal, KeyRound, Minus } from 'lucide-react'
import { Chip } from './primitives'
import s from './brand.module.css'

/* ---------- Equation ---------- */
export interface EquationTerm { label: string; value: string; caption?: string; tone?: 'default' | 'orange' }
/**
 * Elemento distintivo de QUADRA: Agregado − Eliminaciones = Consolidado.
 * El último término es el resultado (tarjeta crema).
 */
export function Equation({ minuend, subtrahend, result }: { minuend: EquationTerm; subtrahend: EquationTerm; result: EquationTerm }) {
  const term = (t: EquationTerm, op: string, isResult = false) => (
    <div className={`${s.term} ${isResult ? s.result : ''}`}>
      <span className={s.termLabel} data-op={op}>{t.label}</span>
      <span className={`${s.termValue} ${t.tone === 'orange' ? s.orange : ''}`}>{t.value}</span>
      {t.caption && <span className={s.termCaption}>{t.caption}</span>}
    </div>
  )
  return (
    <div className={s.equation} role="group" aria-label={`${minuend.label} ${minuend.value} menos ${subtrahend.label} ${subtrahend.value} igual a ${result.label} ${result.value}`}>
      {term(minuend, '')}
      <Minus className={s.operator} size={24} aria-hidden />
      {term(subtrahend, '−')}
      <Equal className={s.operator} size={24} aria-hidden />
      {term(result, '=', true)}
    </div>
  )
}

/* ---------- MirrorPair ---------- */
export interface Leg { label: string; title: string; subtitle: string; amount: string; note?: string }
/** Las dos patas de un documento intercompany unidas por su llave. */
export function MirrorPair({ issuer, receiver, documentKey, statusLabel = 'Conciliado', compact }: {
  issuer: Leg; receiver: Leg; documentKey: string; statusLabel?: string
  /** Apilado y sin fondo propio, para paneles angostos que ya son navy. */
  compact?: boolean
}) {
  const leg = (l: Leg) => (
    <article className={s.leg}>
      <span className={s.legLabel}>{l.label}</span>
      <span className={s.legTitle}>{l.title}</span>
      <span className={s.legSub}>{l.subtitle}</span>
      <span className={s.legValue}>{l.amount}</span>
      {l.note && <span className={s.legNote}>{l.note}</span>}
    </article>
  )
  return (
    <div className={`${s.mirror} ${compact ? s.compact : ''}`}>
      {leg(issuer)}
      <div className={s.link}>
        <span className={s.linkLine} aria-hidden />
        <Chip tone="key" icon={KeyRound}>{documentKey}</Chip>
        <Chip tone="brand" icon={Check}>{statusLabel}</Chip>
        <span className={s.linkLine} aria-hidden />
      </div>
      {leg(receiver)}
    </div>
  )
}

/* ---------- Stepper ---------- */
export type StepState = 'done' | 'current' | 'pending'
export interface StepItem { label: string; state: StepState; detail?: ReactNode }
export function Stepper({ steps, label }: { steps: StepItem[]; label: string }) {
  return (
    <ol className={s.stepper} aria-label={label}>
      {steps.map((step, i) => (
        <li key={step.label} className={`${s.step} ${s[step.state]}`} aria-current={step.state === 'current' ? 'step' : undefined}>
          <span className={s.dot}>{step.state === 'done' ? <Check size={15} aria-hidden /> : i + 1}</span>
          <span className={s.stepText}>
            <span className={s.stepLabel}>{step.label}</span>
            {step.detail && <span className={s.stepDetail}>{step.detail}</span>}
          </span>
        </li>
      ))}
    </ol>
  )
}

/* ---------- Pipeline ---------- */
export interface PipelineStep { title: string; caption?: string; closed: boolean }
/** Cinta "Cierre del grupo": los 5 pasos con check naranja cuando están cerrados. */
export function Pipeline({ steps }: { steps: PipelineStep[] }) {
  return (
    <ol className={s.pipeline} aria-label="Cierre del grupo">
      {steps.map((st, i) => (
        <Fragment key={st.title}>
          <li className={s.pipeStep}>
            <span className={`${s.pipeDot} ${st.closed ? '' : s.open}`}>{st.closed ? <Check size={16} aria-label="Cerrado" /> : i + 1}</span>
            <span className={s.pipeText}>
              <span className={s.pipeTitle}>{st.title}</span>
              {st.caption && <span className={s.pipeCaption}>{st.caption}</span>}
            </span>
            {i < steps.length - 1 && <span className={s.pipeLine} aria-hidden />}
          </li>
        </Fragment>
      ))}
    </ol>
  )
}
