/** Conceptos intercompany compartidos por conciliación, cuenta corriente y documento. */
export type IcType = 'VENTA' | 'GESTION' | 'PRESTAMO' | 'INTERES'
export type ReconciliationResult = 'CONCILIADO' | 'CONCILIADO_FX' | 'DIFERENCIA_MONTO' | 'DIFERENCIA_CORTE' | 'SIN_CONTRAPARTE' | 'FX_FUERA_TOLERANCIA'
