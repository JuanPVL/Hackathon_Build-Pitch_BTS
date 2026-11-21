import type { IcPair, ReconciliationReport } from './domain/types'

/** Datos de prueba tomados del mockup (V2). Solo para pruebas. */
const pair = (key: string, type: IcPair['type'], issuer: IcPair['issuer'], receiver: IcPair['receiver'], currency: IcPair['agreed']['currency'], amount: number, differenceUsd: number, result: IcPair['result']): IcPair =>
  ({ key, type, issuer, receiver, agreed: { currency, amount }, issuerUsd: 0, receiverUsd: 0, differenceUsd, result })

export const reconciliationReport: ReconciliationReport = {
  totals: { documents: 131, reconciled: 131, exact: 39, fx: 92, pending: 0 },
  tolerance: { usd: 50, pct: 2 },
  pairs: [
    pair('IC-F1-2027-01', 'VENTA', 'GT1', 'MX1', 'GTQ', 65000, -78.4319, 'CONCILIADO_FX'),
    pair('IC-F2-2027-01', 'VENTA', 'GT2', 'GT1', 'GTQ', 39000, 0, 'CONCILIADO'),
    pair('IC-F3-2027-01', 'VENTA', 'MX1', 'MX2', 'MXN', 900000, 0, 'CONCILIADO'),
    pair('IC-F4-2027-01', 'VENTA', 'US1', 'GT2', 'USD', 20000, 128.2, 'CONCILIADO_FX'),
    pair('IC-F5a-2027-01', 'GESTION', 'US2', 'GT1', 'USD', 7500, 48.08, 'CONCILIADO_FX'),
    pair('IC-F5c-2027-01', 'GESTION', 'US2', 'MX1', 'USD', 9000, -96.26, 'CONCILIADO_FX'),
    pair('IC-F5e-2027-01', 'GESTION', 'US2', 'US1', 'USD', 9000, 0, 'CONCILIADO'),
    pair('IC-F6-2027-01', 'INTERES', 'US2', 'MX1', 'USD', 13333, -142.6, 'CONCILIADO_FX'),
  ],
  byResult: [
    { result: 'CONCILIADO', count: 39 },
    { result: 'CONCILIADO_FX', count: 92 },
  ],
}
