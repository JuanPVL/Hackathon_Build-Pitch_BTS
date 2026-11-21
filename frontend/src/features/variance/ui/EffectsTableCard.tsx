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

/** Alternativa cuando no hay texto de IA: tabla de efectos calculada por SQL + resumen ejecutivo para el director. */
export function EffectsTableCard({ effects }: { effects: BridgeEffect[] }) {
  const sorted = [...effects].sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
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
      {sorted.length > 0 && (
        <div
          style={{
            marginTop: 14,
            padding: 14,
            borderRadius: 12,
            background: 'var(--q-navy, #0F2341)',
            color: '#fff',
            fontSize: 13,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#93C5FD', marginBottom: 6 }}>
            PARA EL DIRECTOR · RESUMEN EJECUTIVO SQL
          </div>
          <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {sorted.slice(0, 4).map(e => (
              <li key={e.id}>
                <strong>{e.label}:</strong> {formatSigned(e.value)} USD ({effectCompaniesLabel(e)}) <code style={{ opacity: 0.8 }}>[{e.code}]</code>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Card>
  )
}
