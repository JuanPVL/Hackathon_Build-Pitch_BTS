import { describe, expect, it } from 'vitest'
import { NAV_ITEMS, STEP_GROUPS, groupForPath, visibleItems } from './navigation'

describe('navegación', () => {
  it('cada grupo de paso tiene al menos una pantalla visible', () => {
    for (const g of STEP_GROUPS) expect(visibleItems(g.group).length).toBeGreaterThan(0)
  })
  it('la barra inferior móvil tiene como máximo 4 pestañas + Más', () => {
    expect(NAV_ITEMS.filter(i => i.mobileTab).length).toBeLessThanOrEqual(4)
  })
  it('resuelve el paso activo según la ruta', () => {
    expect(groupForPath('/')).toBe('INICIO')
    expect(groupForPath('/documentos/IC-F1-2027-12')).toBe('CONCILIAR')
    expect(groupForPath('/tasas')).toBe('CONVERTIR')
    expect(groupForPath('/desviaciones')).toBe('EXPLICAR')
  })
  it('las rutas no se repiten', () => {
    const paths = NAV_ITEMS.map(i => i.path)
    expect(new Set(paths).size).toBe(paths.length)
  })
})
