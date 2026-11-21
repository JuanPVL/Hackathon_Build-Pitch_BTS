import type { ReactNode } from 'react'
import s from './DataTable.module.css'

export interface Column<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  align?: 'left' | 'right' | 'center'
  /** Celda numérica: tipografía tabular de cifras. */
  numeric?: boolean
  width?: number | string
  /** Oculta la columna por debajo de ese ancho ('lg' = 1024, 'xl' = 1280). */
  hideBelow?: 'lg' | 'xl'
}

export interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  caption: string
  onRowClick?: (row: T) => void
  selectedKey?: string
  rowVariant?: (row: T) => 'highlight' | 'total' | undefined
}

export function DataTable<T>({ columns, rows, rowKey, caption, onRowClick, selectedKey, rowVariant }: DataTableProps<T>) {
  const cellClass = (c: Column<T>) => [
    c.align === 'right' || c.numeric ? s.right : c.align === 'center' ? s.center : '',
    c.numeric ? s.num : '',
    c.hideBelow === 'lg' ? s.hideLg : c.hideBelow === 'xl' ? s.hideXl : '',
  ].join(' ')
  return (
    <div className={s.wrap}>
      <table className={s.table}>
        <caption className="q-sr-only">{caption}</caption>
        <thead>
          <tr>{columns.map(c => <th key={c.key} scope="col" className={cellClass(c)} style={{ width: c.width }}>{c.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const key = rowKey(row)
            const variant = rowVariant?.(row)
            const cls = [variant ? s[variant] : '', onRowClick ? s.clickable : '', key === selectedKey ? s.selected : ''].join(' ')
            return (
              <tr key={key} className={cls} onClick={onRowClick ? () => onRowClick(row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={onRowClick ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(row) } } : undefined}
                aria-selected={onRowClick ? key === selectedKey : undefined}>
                {columns.map(c => <td key={c.key} className={cellClass(c)}>{c.render(row)}</td>)}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Tabla en ≥ 768 px y lista de tarjetas en móvil (regla del sistema de diseño).
 * Solo una de las dos vistas está visible; la otra queda fuera del árbol de accesibilidad.
 */
export function ResponsiveTable<T>({ renderCard, ...table }: DataTableProps<T> & { renderCard: (row: T) => ReactNode }) {
  return (
    <>
      <div className={s.desktopOnly}><DataTable {...table} /></div>
      <ul className={s.mobileOnly} aria-label={table.caption} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {table.rows.map(row => <li key={table.rowKey(row)}>{renderCard(row)}</li>)}
      </ul>
    </>
  )
}
