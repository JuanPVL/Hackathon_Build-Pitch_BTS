import { formatAmount } from '@/shared/format/number'
import { icTypeLabel } from '@/entities/ic'
import { agreedLabel, resultInfo } from '@/entities/ic'
import type { ReconciliationResult } from '@/entities/ic'
import type { DocumentLeg, IcDocumentDetail, LineageNode } from './types'

/** "IC-F1-2027-12 · Venta GT1 → MX1" */
export function documentTitle(doc: Pick<IcDocumentDetail, 'key' | 'type' | 'issuer' | 'receiver'>): string {
  return `${doc.key} · ${icTypeLabel(doc.type)} ${doc.issuer} → ${doc.receiver}`
}

/** Texto del chip de resultado de la cabecera ("Diferencia cambiaria · conciliado"). */
export function resultSummary(result: ReconciliationResult): string {
  return result === 'CONCILIADO_FX' ? 'Diferencia cambiaria · conciliado' : resultInfo(result).label
}

export interface Crumb { label: string; to?: string }

/** Ruta de vuelta: la cuenta corriente con el par ya seleccionado. */
export function pairPath(doc: Pick<IcDocumentDetail, 'issuer' | 'receiver'>): string {
  return `/cuenta-corriente?par=${doc.issuer}-${doc.receiver}`
}

export function pairLabel(doc: Pick<IcDocumentDetail, 'issuer' | 'receiver'>): string {
  return `${doc.issuer} con ${doc.receiver}`
}

/** Cuenta corriente › emisora con receptora › llave. */
export function breadcrumbs(doc: Pick<IcDocumentDetail, 'key' | 'issuer' | 'receiver'>): Crumb[] {
  return [
    { label: 'Cuenta corriente', to: '/cuenta-corriente' },
    { label: pairLabel(doc), to: pairPath(doc) },
    { label: doc.key },
  ]
}

export interface LegView {
  label: string
  title: string
  subtitle: string
  amount: string
  note: string
}

const LEG_TEXT: Record<DocumentLeg['role'], { action: string; title: string }> = {
  CXC: { action: 'EMITE LA FACTURA', title: 'Cuenta por cobrar' },
  CXP: { action: 'RECIBE EL ESPEJO', title: 'Cuenta por pagar espejo' },
}

/** Pata del documento lista para mostrar: monto pactado, equivalente en USD y nota de conversión. */
export function legView(leg: DocumentLeg): LegView {
  const text = LEG_TEXT[leg.role]
  return {
    label: `${leg.company} · ${text.action}`,
    title: text.title,
    subtitle: leg.counterpartyLabel,
    amount: agreedLabel(leg.amount),
    note: `USD ${formatAmount(leg.usd, 2)} · ${leg.conversionNote}`,
  }
}

/** `balance_GT1_V2.csv#fila8` → `BALANCE_GT1_V2.CSV · FILA 8` */
export function originLabel(origin: string): string {
  const [file, anchor] = origin.split('#')
  const row = anchor?.match(/^fila\s*(\d+)$/i)
  const where = row ? `FILA ${row[1]}` : anchor?.toUpperCase()
  return [file.toUpperCase(), where].filter(Boolean).join(' · ')
}

/** Encabezado de un nodo de linaje: el archivo y la fila si viene de una carga; si no, su etiqueta. */
export function lineageHeading(node: LineageNode): string {
  return node.origin ? originLabel(node.origin) : node.label
}

export function lineageSumLabel(ok: boolean): string {
  return ok ? 'Σ aportes = cifra' : 'Σ aportes ≠ cifra'
}

/** Fecha corta (AAAA-MM-DD) de un evento; vacío si no viene. */
export function eventDate(at?: string): string {
  return at ? at.slice(0, 10) : ''
}
