import { ShieldCheck, Sparkles } from 'lucide-react'
import { Card } from '@/shared/ui'
import { allFiguresVerified } from '../domain/bridge'
import type { Narrative } from '../domain/types'
import s from './NarrativeCard.module.css'

/** Texto para el director: la IA solo redacta; cada causa muestra su fuente en el bridge. */
export function NarrativeCard({ narrative }: { narrative: Narrative }) {
  const verified = allFiguresVerified(narrative)
  return (
    <Card tone="navy" className={s.card}>
      <div className={s.head}>
        <h2 className={s.eyebrow}>Para el director</h2>
        <Sparkles size={18} aria-hidden className={s.spark} />
      </div>
      <p className={s.text}>{narrative.text}</p>
      <ol className={s.causes}>
        {narrative.causes.map((c, i) => (
          <li key={c.sourceId} className={s.cause}>
            <span className={s.dot} aria-hidden>{i + 1}</span>
            <span>
              {c.text}
              <code className={s.source}>[{c.sourceId}]</code>
            </span>
          </li>
        ))}
      </ol>
      <p className={`${s.verified} ${verified ? '' : s.warn}`}>
        <ShieldCheck size={16} aria-hidden />
        {narrative.verifiedFigures} de {narrative.totalFigures} cifras verificadas
        {!verified && ' · revisar antes de compartir'}
      </p>
    </Card>
  )
}
