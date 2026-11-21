import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { breadcrumbs, pairLabel, pairPath } from '../domain/document'
import type { IcDocumentDetail } from '../domain/types'
import s from './Breadcrumbs.module.css'

/** Migas en ≥ 768 px; en móvil, un enlace "‹ Volver" al par. */
export function Breadcrumbs({ doc }: { doc: Pick<IcDocumentDetail, 'key' | 'issuer' | 'receiver'> }) {
  const crumbs = breadcrumbs(doc)
  return (
    <>
      <nav aria-label="Migas de pan" className={s.crumbs}>
        <ol>
          {crumbs.map((c, i) => (
            <li key={c.label}>
              {c.to ? <Link to={c.to}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}
              {i < crumbs.length - 1 && <ChevronRight size={14} aria-hidden />}
            </li>
          ))}
        </ol>
      </nav>
      <Link className={s.back} to={pairPath(doc)} aria-label={`Volver a ${pairLabel(doc)}`}>
        <ChevronLeft size={18} aria-hidden />Volver
      </Link>
    </>
  )
}
