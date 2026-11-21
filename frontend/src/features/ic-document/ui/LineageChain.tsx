import { Fragment } from 'react'
import { ArrowDown, ArrowRight, Check, TriangleAlert } from 'lucide-react'
import { Card, CardHeader, Chip } from '@/shared/ui'
import { lineageHeading, lineageSumLabel } from '../domain/document'
import type { IcDocumentDetail } from '../domain/types'
import s from './LineageChain.module.css'

/** Cadena de linaje: de la cifra del saldo a la fila del archivo que la originó. */
export function LineageChain({ nodes, ok }: { nodes: IcDocumentDetail['lineage']; ok: boolean }) {
  return (
    <Card>
      <CardHeader
        title="Linaje de la cifra"
        aside={<Chip tone={ok ? 'ok' : 'err'} icon={ok ? Check : TriangleAlert}>{lineageSumLabel(ok)}</Chip>}
      />
      <ol className={s.chain} aria-label="Cadena de linaje de la cifra">
        {nodes.map((node, i) => (
          <Fragment key={`${node.kind}-${i}`}>
            <li className={`${s.node} ${i === 0 ? s.first : ''}`}>
              <span className={s.heading}>{lineageHeading(node)}</span>
              <strong className={s.value}>{node.origin && <span className="q-sr-only">{node.label}: </span>}{node.value}</strong>
              <span className={s.detail}>{node.detail}</span>
            </li>
            {i < nodes.length - 1 && (
              <li className={s.arrow} aria-hidden>
                <ArrowRight className={s.right} size={18} />
                <ArrowDown className={s.down} size={18} />
              </li>
            )}
          </Fragment>
        ))}
      </ol>
      <p className={s.note}>Nadie escribe un saldo a mano: no existe una tabla donde alguien capture un total entre empresas.</p>
    </Card>
  )
}
