import { TrendingDown, TrendingUp } from 'lucide-react'
import { formatAmount, formatCompact, formatSigned } from '@/shared/format/number'
import { barGeometry, buildWaterfall, waterfallScale } from '../domain/bridge'
import type { VarianceBridge } from '../domain/types'
import s from './Waterfall.module.css'

/** Cascada hecha con CSS: barras flex, sin librerías de gráficos. */
export function Waterfall({ bridge }: { bridge: VarianceBridge }) {
  const steps = buildWaterfall(bridge)
  const scale = waterfallScale(steps)
  return (
    <figure className={s.figure}>
      <ol className={s.chart} aria-label="Cascada de efectos">
        {steps.map(step => {
          const { bottomPct, heightPct } = barGeometry(step, scale)
          const tone = step.kind === 'total' ? s.total : step.direction === 'down' ? s.down : s.up
          const Icon = step.direction === 'down' ? TrendingDown : TrendingUp
          return (
            <li key={step.key} className={s.col}>
              <div className={s.plot}>
                <div className={`${s.bar} ${tone}`} style={{ bottom: `${bottomPct}%`, height: `${heightPct}%` }} />
                <span className={`${s.value} ${tone}`} style={{ bottom: `calc(${bottomPct + heightPct}% + 4px)` }}>
                  {step.kind === 'effect' && step.direction !== 'flat' && <Icon size={14} aria-hidden />}
                  {step.kind === 'total' ? formatAmount(step.value) : formatSigned(step.value)}
                </span>
              </div>
              <span className={s.cat}>{step.label}</span>
            </li>
          )
        })}
      </ol>
      {scale.truncated && <figcaption className={s.note}>Eje recortado desde USD {formatCompact(scale.floor)} para mostrar los efectos.</figcaption>}
    </figure>
  )
}
