import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { Check, FileSearch, Sparkles } from 'lucide-react'
import { Button, Callout } from '@/shared/ui'
import { formatMoney } from '@/shared/format/number'
import type { Finding } from '../domain/types'
import s from './FindingDetail.module.css'

/** Cuerpo del detalle de un hallazgo (sobre navy): encontrado/esperado, impacto, sugerencia y aceptación con motivo. */
export function FindingDetail({ finding, pending, onAccept, compact, canAccept = true }: {
  finding: Finding
  pending: boolean
  onAccept: (justification: string) => void
  /** Dentro de la tarjeta móvil: sin título ni registro, que la tarjeta ya muestra. */
  canAccept?: boolean
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const fieldId = useId()
  const errorId = `${fieldId}-error`

  function submit(event: FormEvent) {
    event.preventDefault()
    const justification = text.trim()
    if (!justification) { setError('La justificación es obligatoria para aceptar la corrección.'); return }
    setError(null)
    onAccept(justification)
  }

  return (
    <div className={s.body}>
      {!compact && <p className={s.scope}>Empresa o moneda afectada: <strong>{finding.scope}</strong></p>}
      {(finding.found || finding.expected) && (
        <div className={s.pair}>
          {finding.found && <div className={s.value}><span className={s.valueLabel}>Encontrado</span><span className={s.valueText}>{finding.found}</span></div>}
          {finding.expected && <div className={s.value}><span className={s.valueLabel}>Esperado</span><span className={s.valueText}>{finding.expected}</span></div>}
        </div>
      )}
      <div className={s.impact}>
        <span className={s.valueLabel}>Impacto estimado en el consolidado</span>
        <span className={s.impactValue}>{formatMoney(finding.impactUsd, 'USD')}</span>
      </div>
      {finding.suggestion && (
        <p className={s.suggestion}><Sparkles size={16} aria-hidden /><span>Sugerencia: {finding.suggestion}</span></p>
      )}
      {finding.suggestion && !open && (
        <Button variant="accent" icon={Check} block disabled={!canAccept} title={!canAccept ? 'El backend aún no ofrece esta acción' : undefined} onClick={() => setOpen(true)}>Aceptar corrección sugerida</Button>
      )}
      {open && (
        <form className={s.form} onSubmit={submit} noValidate>
          <label htmlFor={fieldId} className={s.formLabel}>Justificación (obligatoria)</label>
          <textarea
            id={fieldId}
            className={s.textarea}
            rows={3}
            value={text}
            onChange={e => { setText(e.target.value); if (error) setError(null) }}
            aria-required="true"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            placeholder="Explica por qué aplica la corrección sugerida"
          />
          {error && <p id={errorId} className={s.error} role="alert">{error}</p>}
          <div className={s.formActions}>
            <Button type="submit" variant="accent" icon={Check} disabled={pending}>{pending ? 'Aplicando…' : 'Confirmar corrección'}</Button>
            <Button variant="onDark" onClick={() => { setOpen(false); setError(null) }} disabled={pending}>Cancelar</Button>
          </div>
        </form>
      )}
      {!compact && <Button variant="onDark" icon={FileSearch} block disabled title="Próximamente">Abrir registro origen</Button>}
    </div>
  )
}

export function CorrectionFeedback({ status, findingRule, message }: { status: 'success' | 'error'; findingRule: string; message?: string }) {
  if (status === 'success') {
    return <div role="status"><Callout tone="ok" icon={Check} title={`Corrección de ${findingRule} aceptada.`}>Quedó auditada con autor y motivo; el validador se está actualizando.</Callout></div>
  }
  return <Callout tone="err" title={`No se pudo aceptar la corrección de ${findingRule}.`}>{message ?? 'Intenta de nuevo.'}</Callout>
}
