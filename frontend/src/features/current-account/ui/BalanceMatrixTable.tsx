import type { KeyboardEvent } from 'react'
import { Scale } from 'lucide-react'
import { Callout, Card, CardHeader } from '@/shared/ui'
import { formatSigned } from '@/shared/format/number'
import { antisymmetryViolations, findCell, isSelectable, matrixTitle, statusInfo } from '../domain/matrix'
import { companyName } from '../domain/companies'
import { samePair } from '../domain/pair'
import type { PairSelection } from '../domain/pair'
import type { BalanceMatrix } from '../domain/types'
import type { CompanyCode } from '@/entities'
import { StatusDot } from './StatusDot'
import s from './BalanceMatrixTable.module.css'

interface Props {
  matrix: BalanceMatrix
  selected: PairSelection | null
  onSelect: (company: CompanyCode, counterparty: CompanyCode) => void
}

/** Matriz 6×6 accesible: tabla con encabezados, diagonal inerte y celdas que se abren con teclado. */
export function BalanceMatrixTable({ matrix, selected, onSelect }: Props) {
  const { companies, view } = matrix
  const violations = antisymmetryViolations(matrix)

  /** Flechas: mueve el foco a la celda abrible más cercana en esa dirección. */
  function onKeyDown(e: KeyboardEvent<HTMLTableElement>) {
    const target = e.target as HTMLElement
    const r = Number(target.dataset.r), c = Number(target.dataset.c)
    if (Number.isNaN(r) || Number.isNaN(c)) return
    const step = ({ ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] } as Record<string, [number, number]>)[e.key]
    if (!step) return
    e.preventDefault()
    let nr = r + step[0], nc = c + step[1]
    while (nr >= 0 && nc >= 0 && nr < companies.length && nc < companies.length) {
      const next = e.currentTarget.querySelector<HTMLButtonElement>(`button[data-r="${nr}"][data-c="${nc}"]`)
      if (next) { next.focus(); return }
      nr += step[0]; nc += step[1]
    }
  }

  return (
    <Card>
      <CardHeader
        title={matrixTitle(view)}
        aside={view === 'saldo' ? <span><span aria-hidden>+</span> me deben · <span aria-hidden>−</span> les debo</span> : undefined}
      />
      <div className={s.scroll}>
        <table className={s.table} onKeyDown={onKeyDown}>
          <caption className="q-sr-only">
            {matrixTitle(view)}. Cada fila es la empresa que reporta y cada columna su socio. Selecciona una celda para ver el detalle del par.
          </caption>
          <thead>
            <tr>
              <th scope="col" className={s.corner}>Empresa \ socio</th>
              {companies.map(code => <th key={code} scope="col" className={s.colHead}><abbr title={companyName(code)}>{code}</abbr></th>)}
            </tr>
          </thead>
          <tbody>
            {companies.map((row, r) => (
              <tr key={row}>
                <th scope="row" className={s.rowHead}><abbr title={companyName(row)}>{row}</abbr></th>
                {companies.map((col, c) => {
                  if (row === col) {
                    return <td key={col} className={s.diag} aria-disabled="true"><span aria-hidden>—</span><span className="q-sr-only">{row} con {col}: no aplica</span></td>
                  }
                  const cell = findCell(matrix, row, col)
                  if (!isSelectable(cell)) {
                    return <td key={col} className={s.empty}><span aria-hidden>—</span><span className="q-sr-only">{row} con {col}: sin saldo</span></td>
                  }
                  const isSelected = samePair(selected, { company: row, counterparty: col })
                  const tone = cell.balanceUsd > 0 ? s.pos : s.neg
                  return (
                    <td key={col} className={s.cellTd}>
                      <button
                        type="button" className={s.cell} aria-pressed={isSelected} data-r={r} data-c={c}
                        aria-label={`${row} con ${col}: ${formatSigned(cell.balanceUsd)} USD, ${statusInfo(cell.status).long}`}
                        onClick={() => onSelect(row, col)}
                      >
                        <span className={`${s.amount} ${tone}`}>{formatSigned(cell.balanceUsd)}</span>
                        <StatusDot status={cell.status} />
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {view === 'saldo' && (
        violations.length === 0
          ? <p className={s.note}><Scale size={16} aria-hidden /><span>La matriz es antisimétrica: el saldo de A con B es el espejo del de B con A, salvo diferencias cambiarias dentro de tolerancia.</span></p>
          : <Callout tone="err" icon={Scale} title="La matriz no es antisimétrica.">
              {violations.length} {violations.length === 1 ? 'par no cuadra' : 'pares no cuadran'} con su espejo: {violations.map(v => `${v.a} ↔ ${v.b}`).join(', ')}.
            </Callout>
      )}
    </Card>
  )
}
