import { Check, TriangleAlert } from 'lucide-react'
import { Card, Chip, Eyebrow, textTone, toneForSign } from '@/shared/ui'
import { formatAmount, formatSigned } from '@/shared/format/number'
import { bridgeDelta, bridgeDeltaRatio, formatResidual, isResidualExact, metricLabel } from '../domain/bridge'
import type { VarianceBridge } from '../domain/types'
import { Waterfall } from './Waterfall'
import { EffectList } from './EffectList'
import s from './BridgeCard.module.css'

export function BridgeCard({ bridge }: { bridge: VarianceBridge }) {
  const delta = bridgeDelta(bridge)
  const ratio = bridgeDeltaRatio(bridge)
  const exact = isResidualExact(bridge.residual)
  return (
    <Card>
      <div className={s.head}>
        <div>
          <h2 className={s.eyebrowTitle}><Eyebrow>{metricLabel(bridge.metric)}</Eyebrow></h2>
          <p className={`${s.delta} ${textTone[toneForSign(delta)]}`}>{formatSigned(delta)}</p>
          <p className={s.range}>
            de {formatAmount(bridge.from.value)} a {formatAmount(bridge.to.value)}
            {ratio !== null && ` (${formatSigned(ratio * 100, 1)} %)`}
          </p>
        </div>
        <Chip tone={exact ? 'ok' : 'err'} icon={exact ? Check : TriangleAlert}>Residual {formatResidual(bridge.residual)}</Chip>
      </div>
      <div className={s.chartOnly}><Waterfall bridge={bridge} /></div>
      <div className={s.listOnly}><EffectList effects={bridge.effects} /></div>
    </Card>
  )
}
