import { ArrowRight } from 'lucide-react'
import { SegmentedControl } from '@/shared/ui'
import { SCENARIOS } from '@/shared/hooks/useScenarioContext'
import { METRICS } from '../domain/bridge'
import type { BridgeMetric, BridgeRequest } from '../domain/types'
import s from './BridgeControls.module.css'

const METRIC_LABEL: Record<BridgeMetric, string> = { EBIT: 'EBIT', VENTAS: 'Ventas', EVA: 'EVA' }

function VersionSelect({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className={s.field}>
      <label htmlFor={id} className={s.label}>{label}</label>
      <select id={id} className={s.select} value={value} onChange={e => onChange(e.target.value)}>
        {SCENARIOS.map(sc => <option key={sc.id} value={sc.id}>{sc.label}</option>)}
      </select>
    </div>
  )
}

export function BridgeControls({ request, onFrom, onTo, onMetric }: {
  request: BridgeRequest
  onFrom: (id: string) => void
  onTo: (id: string) => void
  onMetric: (m: BridgeMetric) => void
}) {
  return (
    <div className={s.controls}>
      <VersionSelect id="bridge-from" label="Desde" value={request.from} onChange={onFrom} />
      <ArrowRight className={s.arrow} size={18} aria-hidden />
      <VersionSelect id="bridge-to" label="Hasta" value={request.to} onChange={onTo} />
      <SegmentedControl<BridgeMetric>
        label="Métrica a explicar"
        value={request.metric}
        onChange={onMetric}
        options={METRICS.map(m => ({ value: m, label: METRIC_LABEL[m] }))}
      />
    </div>
  )
}
