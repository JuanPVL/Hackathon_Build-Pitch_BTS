import { useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Card, Eyebrow } from '@/shared/ui'
import { formatAmount, formatSigned } from '@/shared/format/number'
import type { CompanyCode } from '@/entities'
import { companyName } from '../domain/companies'
import { companySummary, partnersOf, statusInfo } from '../domain/matrix'
import { samePair } from '../domain/pair'
import type { PairSelection } from '../domain/pair'
import type { BalanceMatrix, MatrixView } from '../domain/types'
import { StatusDot } from './StatusDot'
import s from './MobileAccountView.module.css'

const SUMMARY_LABEL: Record<MatrixView, string> = { saldo: 'Saldo neto IC', facturado: 'Total facturado', recibido: 'Total recibido' }

interface Props {
  matrix: BalanceMatrix
  selected: PairSelection | null
  onSelectPair: (company: CompanyCode, partner: CompanyCode) => void
  /** Detalle del par seleccionado (lo compone la página). */
  detail: ReactNode
}

/** Móvil: en lugar de la matriz, elegir empresa → resumen → socios → detalle del par. */
export function MobileAccountView({ matrix, selected, onSelectPair, detail }: Props) {
  const [company, setCompany] = useState<CompanyCode>(selected?.company ?? matrix.companies[0])
  const summary = companySummary(matrix, company)
  const partners = partnersOf(matrix, company)
  const isSaldo = matrix.view === 'saldo'
  const partnerWord = summary.partners === 1 ? 'socio' : 'socios'

  return (
    <>
      <div className={s.picker} role="group" aria-label="Empresa que reporta">
        {matrix.companies.map(code => (
          <button key={code} type="button" className={s.companyBtn} aria-pressed={code === company} onClick={() => setCompany(code)}>{code}</button>
        ))}
      </div>

      <Card compact aria-label={`Resumen de ${companyName(company)}`}>
        <Eyebrow>{companyName(company)} · {SUMMARY_LABEL[matrix.view]}</Eyebrow>
        <p className={s.net}>{isSaldo ? formatAmount(summary.netUsd) : formatAmount(summary.receivableUsd)} USD</p>
        <p className={s.caption}>
          {isSaldo
            ? `Le deben ${formatAmount(summary.receivableUsd)} · debe ${formatAmount(summary.payableUsd)} · ${summary.partners} ${partnerWord} con saldo`
            : `${summary.partners} ${partnerWord} con movimiento`}
        </p>
      </Card>

      <Card compact aria-label={`Socios de ${companyName(company)}`}>
        {partners.length === 0
          ? <p className={s.caption}>Esta empresa no tiene saldos con otras empresas del grupo.</p>
          : (
            <ul className={s.partners}>
              {partners.map(p => {
                const open = samePair(selected, { company, counterparty: p.counterparty })
                return (
                  <li key={p.counterparty}>
                    <button
                      type="button" className={s.partner} aria-expanded={open} aria-controls="pair-detail"
                      aria-label={`${p.counterparty} ${companyName(p.counterparty)}, ${statusInfo(p.status).long}, ${formatSigned(p.balanceUsd)} USD`}
                      onClick={() => onSelectPair(company, p.counterparty)}
                    >
                      <span className={s.code} aria-hidden>{p.counterparty}</span>
                      <span className={s.who} aria-hidden>
                        <strong>{companyName(p.counterparty)}</strong>
                        <StatusDot status={p.status} long />
                      </span>
                      <span className={`${s.amount} ${p.balanceUsd > 0 ? s.pos : ''}`} aria-hidden>{formatSigned(p.balanceUsd)}</span>
                      {open ? <ChevronUp size={18} aria-hidden /> : <ChevronDown size={18} aria-hidden />}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
      </Card>

      <div id="pair-detail">{selected?.company === company ? detail : null}</div>
    </>
  )
}
