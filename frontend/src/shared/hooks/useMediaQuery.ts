import { useCallback, useSyncExternalStore } from 'react'

/** Breakpoint móvil del sistema de diseño (≤ 767 px). */
export const MOBILE_QUERY = '(max-width: 767px)'

/** Suscripción a una media query; devuelve false donde matchMedia no existe (SSR, pruebas). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((notify: () => void) => {
    if (typeof window.matchMedia !== 'function') return () => {}
    const mql = window.matchMedia(query)
    mql.addEventListener('change', notify)
    return () => mql.removeEventListener('change', notify)
  }, [query])
  const getSnapshot = () => (typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false)
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

/** true en pantallas móviles. Úsalo solo cuando la vista cambia de estructura, no para estilos. */
export const useIsMobile = () => useMediaQuery(MOBILE_QUERY)
