import { Suspense } from 'react'
import type { ReactNode } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuth } from '@/shared/auth'
import { StateMessage } from '@/shared/ui'
import { BottomNav, Rail, Sidebar } from './Navigation'
import { MobileBar, TopBar } from './TopBar'
import s from './AppShell.module.css'

/**
 * Estructura adaptativa: barra lateral (≥ 1024), riel (768–1023) o barra inferior (< 768).
 * `status` lo inyecta la raíz de la app (no depende de ningún módulo concreto).
 */
export function AppShell({ status }: { status?: ReactNode }) {
  const { unconfigured } = useAuth()
  return (
    <div className={s.shell}>
      <a className={s.skip} href="#contenido">Saltar al contenido</a>
      <Sidebar />
      <Rail />
      <div className={s.main}>
        <TopBar status={status} />
        <MobileBar status={status} />
        {unconfigured && <p className={s.devBanner} role="note">Modo desarrollo: Supabase no está configurado, así que no hay sesión ni datos del backend.</p>}
        <main id="contenido" className={s.content} tabIndex={-1}>
          <Suspense fallback={<StateMessage kind="loading" title="Cargando…" />}><Outlet /></Suspense>
        </main>
        <BottomNav />
      </div>
    </div>
  )
}
