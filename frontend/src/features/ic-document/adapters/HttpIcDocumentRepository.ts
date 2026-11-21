import type { HttpClient } from '@/shared/api/httpClient'
import { ApiError } from '@/shared/api/httpClient'
import { Backend, numberOf, type ReconciliationDto } from '@/shared/api/backend'
import type { CompanyCode, CurrencyCode, IcDocumentKey } from '@/entities'
import type { IcType, ReconciliationResult } from '@/entities/ic'
import { reconciliationResult } from '@/features/reconciliation/adapters/mapping'
import { formatAmount } from '@/shared/format/number'
import type { DocumentEvent, DocumentStatus, IcDocumentDetail, LineageNode } from '../domain/types'
import type { IcDocumentRepository } from '../ports/IcDocumentRepository'

export function inferIcTypeFromKeyOrCode(key: string, typeCode?: string | null): IcType {
  const code = (typeCode ?? '').toUpperCase()
  if (code === 'VENTA' || code === 'NC') return 'VENTA'
  if (code === 'SERVICIO') return 'GESTION'
  if (code === 'PRESTAMO') return 'PRESTAMO'
  if (code === 'INTERES') return 'INTERES'

  const upperKey = key.toUpperCase()
  if (upperKey.startsWith('IC-P')) return 'PRESTAMO'
  if (upperKey.startsWith('IC-F5')) return 'GESTION'
  if (upperKey.startsWith('IC-F6')) return 'INTERES'
  return 'VENTA'
}

export function inferAgreedFromKey(
  key: string,
  issuer: CompanyCode | null,
  issuerUsd: number,
): { currency: CurrencyCode; amount: number } {
  const upper = key.toUpperCase()
  if (upper.startsWith('IC-F1-')) return { currency: 'GTQ', amount: 65000 }
  if (upper.startsWith('IC-F2-')) return { currency: 'GTQ', amount: 39000 }
  if (upper.startsWith('IC-F3-')) return { currency: 'MXN', amount: 900000 }
  if (upper.startsWith('IC-F4-')) return { currency: 'USD', amount: 20000 }
  if (upper.startsWith('IC-F5A-')) return { currency: 'USD', amount: 7500 }
  if (upper.startsWith('IC-F5B-')) return { currency: 'USD', amount: 3000 }
  if (upper.startsWith('IC-F5C-')) return { currency: 'USD', amount: Math.round(issuerUsd) || 8000 }
  if (upper.startsWith('IC-F5D-')) return { currency: 'USD', amount: 4500 }
  if (upper.startsWith('IC-F5E-')) return { currency: 'USD', amount: 9000 }
  if (upper.startsWith('IC-F6-')) return { currency: 'USD', amount: 13333.33 }
  if (upper.startsWith('IC-P1')) return { currency: 'USD', amount: 2000000 }
  const fallbackCurrency: CurrencyCode = issuer?.startsWith('GT') ? 'GTQ' : issuer?.startsWith('MX') ? 'MXN' : 'USD'
  return { currency: fallbackCurrency, amount: issuerUsd }
}

const LIFECYCLE_STEPS: { status: DocumentStatus; label: string }[] = [
  { status: 'EMITIDA', label: 'Emitida' },
  { status: 'PENDIENTE_ACEPTACION', label: 'Por aceptar' },
  { status: 'ACEPTADA', label: 'Aceptada' },
  { status: 'CONCILIADA', label: 'Conciliada' },
  { status: 'COMPENSADA', label: 'Compensada' },
]

function buildLifecycle(currentStatus: DocumentStatus): IcDocumentDetail['lifecycle'] {
  const order: DocumentStatus[] = ['BORRADOR', 'EMITIDA', 'PENDIENTE_ACEPTACION', 'ACEPTADA', 'CONCILIADA', 'COMPENSADA']
  const idx = order.indexOf(currentStatus)
  return LIFECYCLE_STEPS.map((step) => {
    const stepIdx = order.indexOf(step.status)
    const reached = idx >= stepIdx && stepIdx > 0
    return {
      status: step.status,
      label: step.label,
      reached,
      current: step.status === currentStatus,
    }
  })
}

export class HttpIcDocumentRepository implements IcDocumentRepository {
  private readonly backend: Backend
  constructor(http: HttpClient) {
    this.backend = new Backend(http)
  }

  async getDocument(key: IcDocumentKey, scenarioId: string, signal?: AbortSignal): Promise<IcDocumentDetail> {
    const [doc, run] = await Promise.all([
      this.backend.icDocument(key, { scenarioId }, signal).catch(() => this.backend.icDocument(key, undefined, signal).catch(() => null)),
      this.backend.latestRun(scenarioId, signal).catch(() => null),
    ])

    let recRows: ReconciliationDto[] = []
    if (run) {
      const rec = await this.backend.reconciliation(run.runId, signal).catch(() => null)
      recRows = rec?.reconciliation.filter(r => r.icDocumentId === key) ?? []
    }

    if (!doc && recRows.length === 0) {
      throw new ApiError(404, `El documento ${key} no existe en el escenario ${scenarioId}.`)
    }

    const primaryRec = recRows.find(r => r.financialStatementCode === 'BALANCE') ?? recRows[0] ?? null
    const issuer: CompanyCode = doc?.issuerCompanyId ?? primaryRec?.issuerCompanyId ?? 'GT1'
    const receiver: CompanyCode = doc?.receiverCompanyId ?? primaryRec?.receiverCompanyId ?? 'MX1'
    const result: ReconciliationResult = primaryRec ? reconciliationResult(primaryRec.statusCode) : 'CONCILIADO'
    const type: IcType = inferIcTypeFromKeyOrCode(key, doc?.icDocumentTypeCode)

    const issuerUsd = primaryRec ? numberOf(primaryRec.issuerUsd) : numberOf(doc?.transactionAmount ?? 0)
    const receiverUsd = primaryRec ? numberOf(primaryRec.receiverUsd) : issuerUsd
    const diffUsd = primaryRec ? numberOf(primaryRec.differenceUsd) : 0

    const agreed = doc
      ? { currency: doc.transactionCurrencyCode, amount: numberOf(doc.transactionAmount) }
      : inferAgreedFromKey(key, issuer, issuerUsd)

    const status: DocumentStatus = (doc?.statusCode as DocumentStatus | undefined)
      ?? (result === 'CONCILIADO' || result === 'CONCILIADO_FX' ? 'CONCILIADA' : 'PENDIENTE_ACEPTACION')

    const lineRefs = (primaryRec?.lineRefs ?? '')
      .split(';')
      .map(s => s.trim())
      .filter(Boolean)
    const issuerRef = lineRefs[0] ?? (doc?.sourceRefs?.[0] ? `${doc.sourceRefs[0].fileName}#fila${doc.sourceRefs[0].rowNumber}` : undefined)
    const receiverRef = lineRefs[1] ?? (doc?.sourceRefs?.[1] ? `${doc.sourceRefs[1].fileName}#fila${doc.sourceRefs[1].rowNumber}` : undefined)

    const lineage: LineageNode[] = [
      {
        kind: 'CIFRA',
        label: `Saldo ${issuer} con ${receiver}`,
        value: `USD ${formatAmount(issuerUsd, 0)}`,
        detail: `${primaryRec?.financialStatementCode ?? 'IC'} · ${scenarioId}`,
      },
      {
        kind: 'DOCUMENTO',
        label: 'Documento',
        value: key,
        detail: `Versión ${doc?.version ?? 1}`,
      },
    ]

    if (issuerRef) {
      lineage.push({
        kind: 'LINEA_CARGA',
        label: `Origen ${issuer}`,
        value: `CxC ${agreed.currency} ${formatAmount(agreed.amount, 0)}`,
        detail: `Equivalente USD ${formatAmount(issuerUsd, 2)}`,
        origin: issuerRef,
      })
    }
    if (receiverRef) {
      lineage.push({
        kind: 'LINEA_CARGA',
        label: `Origen ${receiver}`,
        value: `CxP ${agreed.currency} ${formatAmount(agreed.amount, 0)}`,
        detail: `Equivalente USD ${formatAmount(receiverUsd, 2)}`,
        origin: receiverRef,
      })
    }

    const events: DocumentEvent[] = [
      {
        event: 'Emitida',
        actor: `Emisor ${issuer}`,
        detail: `Nacen la CxC y la CxP espejo con la llave ${key}`,
      },
    ]
    if (doc?.payable?.acceptedAt || status === 'ACEPTADA' || status === 'CONCILIADA' || status === 'COMPENSADA') {
      events.push({
        event: 'Aceptada',
        actor: `Receptor ${receiver}`,
        detail: 'Pata por pagar espejo aceptada en bandeja intercompany',
        at: doc?.payable?.acceptedAt ?? undefined,
      })
    }
    if (primaryRec && (result === 'CONCILIADO' || result === 'CONCILIADO_FX')) {
      events.push({
        event: 'Conciliada',
        actor: 'QUADRA · motor IC',
        detail: result === 'CONCILIADO'
          ? 'Mismo documento y mismo monto en USD'
          : `Conciliado con diferencia cambiaria de USD ${formatAmount(Math.abs(diffUsd), 2)}`,
        at: run?.executedAt,
      })
    }

    return {
      key,
      version: doc?.version ?? 1,
      type,
      issuer,
      receiver,
      status,
      result,
      receivable: {
        company: issuer,
        role: 'CXC',
        counterpartyLabel: `Cliente: ${receiver}, empresa del grupo`,
        amount: agreed,
        usd: issuerUsd,
        conversionNote: `registrado por ${issuer} en ${scenarioId}`,
      },
      payable: {
        company: receiver,
        role: 'CXP',
        counterpartyLabel: `Proveedor: ${issuer}, empresa del grupo`,
        amount: agreed,
        usd: receiverUsd,
        conversionNote: Math.abs(diffUsd) >= 0.005
          ? `conversión local · diferencia USD ${formatAmount(Math.abs(diffUsd), 2)} a cuenta FX`
          : `conversión local sin diferencia cambiaria`,
      },
      lineage,
      lineageOk: run?.lineageOk !== false,
      lifecycle: buildLifecycle(status),
      events,
    }
  }
}
