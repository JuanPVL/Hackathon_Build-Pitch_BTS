import { COMPANIES } from '@/entities'
import type { CompanyCode } from '@/entities'

/** Nombre comercial de la empresa; si el código no se conoce, devuelve el propio código. */
export function companyName(code: CompanyCode | string): string {
  return COMPANIES.find(c => c.code === code)?.name ?? code
}

export function isCompanyCode(value: string): value is CompanyCode {
  return COMPANIES.some(c => c.code === value)
}
