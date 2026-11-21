import { Card, CardHeader, ResponsiveTable, textTone } from '@/shared/ui'
import type { Column } from '@/shared/ui'
import { formatSigned } from '@/shared/format/number'
import { directionOf, effectCompaniesLabel } from '../domain/bridge'
import type { BridgeEffect } from '../domain/types'
import s from './EffectsTableCard.module.css'

const tone = (v: number) => (directionOf(v) === 'down' ? textTone.orange : textTone.blue)

const columns: Column<BridgeEffect>[] = [
  { key: 'label', header: 'Efecto', render: e => e.label },
  { key: 'companies', header: 'Empresas', render: e => <span className={s.muted}>{effectCompaniesLabel(e)}</span> },
  { key: 'value', header: 'Valor', numeric: true, render: e => <span className={tone(e.value)}>{formatSigned(e.value)}</span> },
]

/** Alternativa cuando no hay texto de IA: solo la tabla de efectos calculada por SQL. */
export function EffectsTableCard({ effects }: { effects: BridgeEffect[] }) {
  return (
    <Card>
      <CardHeader title="Efectos calculados" />
      <p className={s.explain}>
        Todavía no hay texto redactado para esta comparación. Los efectos de la tabla los calcula SQL; la IA solo redacta cifras que ya existen en el puente.
      </p>
      <ResponsiveTable
        caption="Efectos del puente entre versiones"
        columns={columns}
        rows={effects}
        rowKey={e => e.id}
        renderCard={e => (
          <div className={s.card}>
            <span>{e.label}<span className={s.muted}> · {effectCompaniesLabel(e)}</span></span>
            <strong className={tone(e.value)}>{formatSigned(e.value)}</strong>
          </div>
        )}
      />
    </Card>
  )
}
