import type { IcDocumentDetail } from './domain/types'

/** Documento IC-F1-2027-12 del mockup 10. Solo para pruebas. */
export const documentF1_12: IcDocumentDetail = {
  key: 'IC-F1-2027-12',
  version: 1,
  type: 'VENTA',
  issuer: 'GT1',
  receiver: 'MX1',
  status: 'CONCILIADA',
  result: 'CONCILIADO_FX',
  receivable: {
    company: 'GT1', role: 'CXC', counterpartyLabel: 'Cliente: MX1, empresa del grupo',
    amount: { currency: 'GTQ', amount: 65000 }, usd: 8333.33, conversionNote: 'tasa del grupo 7.80 GTQ/USD',
  },
  payable: {
    company: 'MX1', role: 'CXP', counterpartyLabel: 'Proveedor: GT1, empresa del grupo',
    amount: { currency: 'GTQ', amount: 65000 }, usd: 8411.77, conversionNote: 'via MXN 157,300 · diferencia 78.43 a la cuenta 7900',
  },
  lineage: [
    { kind: 'CIFRA', label: 'Saldo GT1 con MX1', value: 'USD 8,333', detail: 'Matriz IC · cierre 2027-12' },
    { kind: 'DOCUMENTO', label: 'Documento', value: 'IC-F1-2027-12', detail: 'Venta · versión 1' },
    { kind: 'LINEA_CARGA', label: 'Balance GT1', value: 'CxC GTQ 65,000', detail: '× 0.128205 = USD 8,333.33', origin: 'balance_GT1_V2.csv#fila8' },
    { kind: 'LINEA_CARGA', label: 'Balance MX1', value: 'CxP GTQ 65,000', detail: 'MXN 157,300 × 0.053476', origin: 'balance_MX1_V2.csv#fila8' },
  ],
  lineageOk: true,
  lifecycle: [
    { status: 'EMITIDA', label: 'Emitida', reached: true, current: false },
    { status: 'PENDIENTE_ACEPTACION', label: 'Por aceptar', reached: true, current: false },
    { status: 'ACEPTADA', label: 'Aceptada', reached: true, current: false },
    { status: 'CONCILIADA', label: 'Conciliada', reached: true, current: true },
    { status: 'COMPENSADA', label: 'Compensada', reached: false, current: false },
  ],
  events: [
    { event: 'Emitida', actor: 'Contador GT1', detail: 'Nacen la CxC y la CxP espejo con la llave' },
    { event: 'Aceptada', actor: 'Contador MX1', detail: 'La vio en su bandeja de facturas del grupo y la aceptó' },
    { event: 'Conciliada', actor: 'QUADRA · regla N2', detail: 'Mismo monto pactado; diferencia cambiaria a su cuenta' },
    { event: 'Eliminada', actor: 'QUADRA · corrida V2-003', detail: 'Se elimina al consolidar el presupuesto V2' },
  ],
}
