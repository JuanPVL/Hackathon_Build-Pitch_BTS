import { Card, Eyebrow, textTone, toneForSign } from '@/shared/ui'
import { formatAmount, formatSigned } from '@/shared/format/number'
import { evaDelta, largestEffect } from '../domain/bridge'
import type { VarianceBridge } from '../domain/types'
import s from './EvaBridgeCard.module.css'

export function EvaBridgeCard({ eva, fromLabel, toLabel }: { eva: VarianceBridge['eva']; fromLabel: string; toLabel: string }) {
  const delta = evaDelta(eva)
  const biggest = largestEffect(eva.effects)
  return (
    <Card>
      <h2 className={s.title}><Eyebrow>EVA · {fromLabel} → {toLabel}</Eyebrow></h2>
      <p className={`${s.delta} ${textTone[toneForSign(delta)]}`}>{formatSigned(delta)}</p>
      <p className={s.range}>{formatAmount(eva.from)} → {formatAmount(eva.to)}</p>
      <ul className={s.list}>
        {eva.effects.map(e => (
          <li key={e.label} className={`${s.item} ${e === biggest ? s.main : ''}`}>
            <span>{e.label}</span>
            <strong className={e.value < 0 ? textTone.orange : textTone.blue}>{formatSigned(e.value)}</strong>
          </li>
        ))}
      </ul>
      <p className={s.note}>El WACC es un parámetro versionado con autor y vigencia; su cambio se reporta como causa, no se esconde.</p>
    </Card>
  )
}
