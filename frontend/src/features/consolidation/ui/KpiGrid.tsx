import { Chip, Grid, StatCard } from '@/shared/ui'
import { formatKpiDifference, formatKpiValue, formatKpiWithout, kpiDifference } from '../domain/consolidation'
import type { KpiCode, KpiValue } from '../domain/types'
import s from './KpiGrid.module.css'

const LABELS: Record<KpiCode, string> = { EBIT: 'EBIT · USD', ROIC: 'ROIC', ROCE: 'ROCE', EVA: 'EVA · USD' }

function KpiFooter({ kpi }: { kpi: KpiValue }) {
  const diff = kpiDifference(kpi)
  return (
    <>
      <span className={s.compare}>
        sin eliminar {formatKpiWithout(kpi)}
        <Chip tone={diff === 0 ? 'neutral' : 'ok'}>{formatKpiDifference(kpi)}</Chip>
      </span>
      <span className={s.formula}>{kpi.formula}</span>
    </>
  )
}

export function KpiGrid({ kpis }: { kpis: KpiValue[] }) {
  return (
    <section aria-label="Indicadores del grupo">
      <Grid cols={4}>
        {kpis.map(kpi => (
          <StatCard
            key={kpi.code}
            label={LABELS[kpi.code]}
            value={formatKpiValue(kpi)}
            valueTone={kpi.value < 0 ? 'orange' : 'blue'}
            footer={<KpiFooter kpi={kpi} />}
          />
        ))}
      </Grid>
    </section>
  )
}
