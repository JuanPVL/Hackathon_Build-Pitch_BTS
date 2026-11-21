import { ArrowLeftRight, GitBranch, Info, Check } from 'lucide-react'
import { Card, Chip, Equation } from '@/shared/ui'
import { formatAmount, formatMoney, formatSigned } from '@/shared/format/number'
import { uneliminatedSalesRatio } from '../domain/consolidation'
import type { ConsolidationSummary } from '../domain/types'
import s from './SalesEquationCard.module.css'

/** Elemento distintivo: Agregado − Eliminaciones IC = Consolidado, con sus tres hechos. */
export function SalesEquationCard({ summary }: { summary: ConsolidationSummary }) {
  const { sales, lineage, lineageOk, fxDifferenceIc } = summary
  const ratio = uneliminatedSalesRatio(sales)
  return (
    <Card tone="navy" className={s.card} aria-label="Ventas del grupo">
      <div className={s.head}>
        <div>
          <h2 className={s.eyebrow}>Ventas del grupo · USD</h2>
          <p className={s.lead}>Lo que el grupo se vende a sí mismo se elimina solo. Nadie captura este número.</p>
        </div>
        {lineageOk && <Chip tone="brand" icon={Check}>Linaje OK</Chip>}
      </div>
      <Equation
        minuend={{ label: 'Agregado', value: formatAmount(sales.aggregate), caption: 'Suma simple de las 6 empresas' }}
        subtrahend={{ label: 'Eliminaciones IC', value: formatAmount(sales.eliminations), caption: `Ventas entre empresas · ${sales.icDocuments} docs`, tone: 'orange' }}
        result={{ label: 'Consolidado', value: formatAmount(sales.consolidated), caption: 'Sin doble conteo' }}
      />
      <ul className={s.facts}>
        <li><Info size={16} aria-hidden />Sin eliminar: {formatSigned(ratio * 100, 1)} % de ventas</li>
        <li><ArrowLeftRight size={16} aria-hidden />Diferencia cambiaria IC → 7900: {formatMoney(fxDifferenceIc, 'USD')}</li>
        <li><GitBranch size={16} aria-hidden />Linaje: {lineage.accountsOk} de {lineage.accountsTotal} cuentas cuadran</li>
      </ul>
    </Card>
  )
}
