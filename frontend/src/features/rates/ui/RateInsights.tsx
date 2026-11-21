import { CircleAlert, Info } from 'lucide-react'
import { Callout, Card, CardHeader, Chip } from '@/shared/ui'
import { formatMoney } from '@/shared/format/number'
import type { RatesTable } from '../domain/types'
import { alertTone, rateTypeLabel, sortAlerts } from '../domain/rates'
import s from './RateInsights.module.css'

/** Qué tipo de tasa usa cada familia de cifras y adónde va la diferencia cambiaria. */
export function ConversionRulesCard({ table }: { table: RatesTable }) {
  return (
    <Card>
      <CardHeader title="Qué tasa usa cada cifra" />
      <ul className={s.rules} aria-label="Tipo de tasa por cifra">
        {table.conversionRules.map(rule => (
          <li key={rule.scope} className={s.rule}>
            <span>{rule.scope}</span>
            <Chip tone="neutral" square>{rateTypeLabel(rule.rateType)}</Chip>
          </li>
        ))}
      </ul>
      <div className={s.cta}>
        <strong>La diferencia va a la cuenta 3900 (CTA)</strong>
        <span>{formatMoney(table.ctaUsd, 'USD')} en {table.version}: el balance cuadra sin forzarlo.</span>
      </div>
    </Card>
  )
}

/** Alertas del control de tasas y la banda contra la mediana. */
export function RateControlsCard({ table }: { table: RatesTable }) {
  const alerts = sortAlerts(table.alerts)
  return (
    <Card>
      <CardHeader title="Controles sobre las tasas" />
      <div className={s.alerts}>
        {alerts.length === 0 && <Callout tone="ok" title="Sin alertas.">Ninguna tasa salió de la banda de control.</Callout>}
        {alerts.map(a => (
          <Callout key={`${a.rule ?? ''}${a.title}`} tone={alertTone(a)} icon={alertTone(a) === 'err' ? CircleAlert : Info} title={a.title}>
            {a.detail}
          </Callout>
        ))}
      </div>
      <p className={s.band}>Banda de control: ±{table.controlBandPct} % contra la mediana de tasas.</p>
    </Card>
  )
}
