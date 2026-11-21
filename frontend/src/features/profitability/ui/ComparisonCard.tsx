import type { ReactNode } from 'react'
import { Card, CardHeader } from '@/shared/ui'
import { formatComparisonValue } from '../domain/profitability'
import type { ComparisonRow } from '../domain/types'
import s from './ComparisonCard.module.css'

/** Tabla de dos columnas comparables (p. ej. sin eliminar vs eliminado). */
export function ComparisonCard({ title, aside, conceptHeader, leftHeader, rightHeader, rows, leftNegative }: {
  title: string
  aside?: ReactNode
  conceptHeader: string
  leftHeader: string
  rightHeader: string
  rows: ComparisonRow[]
  /** La columna izquierda es la "mala" (se resalta con signo y color de alerta si es negativa). */
  leftNegative?: boolean
}) {
  return (
    <Card>
      <CardHeader title={title} aside={aside} />
      <table className={s.table}>
        <caption className="q-sr-only">{title}</caption>
        <thead>
          <tr>
            <th scope="col">{conceptHeader}</th>
            <th scope="col" className={s.num}>{leftHeader}</th>
            <th scope="col" className={s.num}>{rightHeader}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              <td className={`${s.num} ${leftNegative && r.left < 0 ? s.bad : s.muted}`}>{formatComparisonValue(r.left, r.unit)}</td>
              <td className={`${s.num} ${s.good}`}>{formatComparisonValue(r.right, r.unit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
