import type { CompanyCode, IcDocumentKey } from '@/entities'
import { agreedLabel } from '@/entities/ic'
import { isCompanyCode } from './companies'
import type { PairDetail, PairDocument } from './types'

export interface PairSelection { company: CompanyCode; counterparty: CompanyCode }

/** `par=GT1-MX1` → selección; devuelve null si el valor es inválido o repite la empresa. */
export function parsePairParam(raw: string | null): PairSelection | null {
  if (!raw) return null
  const [company, counterparty, ...rest] = raw.split('-')
  if (rest.length > 0 || !company || !counterparty) return null
  if (!isCompanyCode(company) || !isCompanyCode(counterparty) || company === counterparty) return null
  return { company, counterparty }
}

export function formatPairParam(pair: PairSelection): string {
  return `${pair.company}-${pair.counterparty}`
}

export function samePair(a: PairSelection | null, b: PairSelection | null): boolean {
  return !!a && !!b && a.company === b.company && a.counterparty === b.counterparty
}

export interface PairMirror {
  creditor: CompanyCode
  debtor: CompanyCode
  /** Saldo del acreedor frente al deudor, en USD (positivo). */
  creditorUsd: number
  /** Saldo espejo que reporta el deudor, en USD (positivo). */
  debtorUsd: number
  firstDocument: PairDocument | undefined
  firstDocumentAmount: string | undefined
}

/**
 * Las dos patas del par: quien tiene saldo positivo es acreedor (emite la CxC) y la otra
 * empresa lleva la CxP espejo. Con saldo cero, la empresa consultada se toma como acreedora.
 */
export function pairMirror(detail: PairDetail): PairMirror {
  const companyIsCreditor = detail.balanceUsd >= 0
  const creditor = companyIsCreditor ? detail.company : detail.counterparty
  const debtor = companyIsCreditor ? detail.counterparty : detail.company
  const creditorUsd = Math.abs(companyIsCreditor ? detail.balanceUsd : detail.mirrorBalanceUsd)
  const debtorUsd = Math.abs(companyIsCreditor ? detail.mirrorBalanceUsd : detail.balanceUsd)
  const firstDocument = detail.documents[0]
  return { creditor, debtor, creditorUsd, debtorUsd, firstDocument, firstDocumentAmount: firstDocument?.agreed ? agreedLabel(firstDocument.agreed) : undefined }
}

export function documentPath(key: IcDocumentKey): string {
  return `/documentos/${encodeURIComponent(key)}`
}
