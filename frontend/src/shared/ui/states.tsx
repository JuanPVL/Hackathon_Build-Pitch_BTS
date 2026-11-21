import type { ReactNode } from 'react'
import { CircleAlert, Inbox, Lock, PlugZap, RefreshCw } from 'lucide-react'
import { ApiError } from '@/shared/api/httpClient'
import { Button } from './primitives'
import s from './states.module.css'

/** Pantalla completa (carga de sesión, configuración faltante, 404). */
export function FullState({ title, children, busy, action }: { title: string; children?: ReactNode; busy?: boolean; action?: ReactNode }) {
  return (
    <main className={s.full} role={busy ? 'status' : undefined}>
      <div className={s.fullCard}>
        <img src="/brand/quadra-horizontal-positivo.svg" alt="QUADRA" width={141} height={32} />
        <h1>{title}</h1>
        {children && <p>{children}</p>}
        {action}
      </div>
    </main>
  )
}

/** Estado vacío, de error o sin permiso dentro de una pantalla. */
export function StateMessage({ kind, title, children, onRetry }: { kind: 'empty' | 'error' | 'forbidden' | 'offline' | 'loading'; title: string; children?: ReactNode; onRetry?: () => void }) {
  const Icon = { empty: Inbox, error: CircleAlert, forbidden: Lock, offline: PlugZap, loading: RefreshCw }[kind]
  return (
    <div className={`${s.message} ${s[kind]}`} role={kind === 'loading' ? 'status' : kind === 'error' ? 'alert' : undefined}>
      <span className={s.icon}><Icon size={26} aria-hidden /></span>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {onRetry && <Button icon={RefreshCw} onClick={onRetry}>Reintentar</Button>}
    </div>
  )
}

/** Forma mínima de una consulta (compatible con TanStack Query). */
export interface QueryLike<T> { data: T | undefined; isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown }

/**
 * Traduce el estado de una consulta a la vista correcta: cargando, sin backend,
 * sin permiso, sin datos o error; si hay datos, llama a `children`.
 */
export function QueryState<T>({ query, isEmpty, emptyTitle = 'Aún no hay datos', emptyText, children }: {
  query: QueryLike<T>
  isEmpty?: (data: T) => boolean
  emptyTitle?: string
  emptyText?: ReactNode
  children: (data: T) => ReactNode
}) {
  if (query.isPending) return <StateMessage kind="loading" title="Cargando…" />
  if (query.isError) {
    const err = query.error
    if (err instanceof ApiError) {
      if (err.isForbidden) return <StateMessage kind="forbidden" title="Sin permiso">Tu usuario no tiene acceso a esta información. Pide acceso al controller del grupo.</StateMessage>
      if (err.isNotFound) return <StateMessage kind="empty" title={emptyTitle}>{emptyText ?? 'El servicio todavía no expone esta información.'}</StateMessage>
      if (err.isNetwork || err.isUnavailable) return <StateMessage kind="offline" title="Sin conexión con el servidor" onRetry={() => query.refetch()}>No se pudo conectar con la API de QUADRA. Revisa que el backend esté en línea.</StateMessage>
      return <StateMessage kind="error" title="No se pudo cargar" onRetry={() => query.refetch()}>{err.message}</StateMessage>
    }
    return <StateMessage kind="error" title="No se pudo cargar" onRetry={() => query.refetch()}>Ocurrió un error inesperado.</StateMessage>
  }
  if (query.data === undefined || isEmpty?.(query.data)) return <StateMessage kind="empty" title={emptyTitle}>{emptyText}</StateMessage>
  return <>{children(query.data)}</>
}
