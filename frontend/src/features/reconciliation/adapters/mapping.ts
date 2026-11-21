import { ApiError } from '@/shared/api/httpClient'
import { numberOf } from '@/shared/api/backend'
import type { ReconciliationDto } from '@/shared/api/backend'
import type { IcPair, ReconciliationResult } from '../domain/types'

const RESULTS = new Set<ReconciliationResult>(['CONCILIADO', 'CONCILIADO_FX', 'DIFERENCIA_MONTO', 'DIFERENCIA_CORTE', 'SIN_CONTRAPARTE', 'FX_FUERA_TOLERANCIA'])
export function reconciliationResult(code: string): ReconciliationResult {
  if (code === 'SALDO_NO_CUADRA') return 'DIFERENCIA_MONTO'
  if (!RESULTS.has(code as ReconciliationResult)) throw new ApiError(502, 'La API devolvió un estado de conciliación desconocido.')
  return code as ReconciliationResult
}
export function mapPair(row: ReconciliationDto): IcPair {
  return {
    key: row.icDocumentId, statement: row.financialStatementCode,
    // La API publica las patas en USD, no el importe pactado ni el tipo documental.
    type: null, agreed: null, issuer: row.issuerCompanyId, receiver: row.receiverCompanyId,
    issuerUsd: numberOf(row.issuerUsd), receiverUsd: numberOf(row.receiverUsd),
    differenceUsd: numberOf(row.differenceUsd), result: reconciliationResult(row.statusCode),
  }
}
export function pairCounts(rows: ReconciliationDto[]) {
  const results = rows.map(r => reconciliationResult(r.statusCode))
  const exact = results.filter(r => r === 'CONCILIADO').length
  const fx = results.filter(r => r === 'CONCILIADO_FX').length
  return {
    documents: rows.length, exact, fx, reconciled: exact + fx,
    pending: rows.length - exact - fx,
    orphan: results.filter(r => r === 'SIN_CONTRAPARTE').length,
    // No hay estado de disputa de documentos en esta respuesta.
    disputed: Number.NaN,
  }
}
