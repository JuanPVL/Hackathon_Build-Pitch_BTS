import { useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronDown, LogOut, Search } from 'lucide-react'
import { useAuth } from '@/shared/auth'
import { SCENARIOS, useScenarioContext } from '@/shared/hooks'
import s from './AppShell.module.css'

function ScenarioSelect({ className }: { className?: string }) {
  const { scenario, setScenario } = useScenarioContext()
  return (
    <select className={className} aria-label="Versión del presupuesto" value={scenario.id} onChange={e => setScenario(e.target.value)}>
      {SCENARIOS.map(o => <option key={o.id} value={o.id}>{o.short}</option>)}
    </select>
  )
}

function UserMenu() {
  const { session, signOut } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const email = session?.user.email ?? 'Modo desarrollo'
  return (
    <div className={s.user}>
      <div className={s.userText}><span className={s.userName}>{email}</span><span className={s.userRole}>Controller de grupo</span></div>
      <span className={s.avatar} aria-hidden>{email[0]?.toUpperCase() ?? 'Q'}</span>
      {session && <button type="button" className={s.iconBtn} aria-label="Cerrar sesión" onClick={async () => setError(await signOut())}><LogOut size={18} /></button>}
      {error && <span role="alert" className="q-sr-only">{error}</span>}
    </div>
  )
}

/** Barra de contexto (≥ 768): periodo, versión, moneda, estado del grupo y usuario. */
export function TopBar({ status }: { status?: ReactNode }) {
  return (
    <header className={s.topbar}>
      <div className={s.ctx}><span className={s.ctxK}>Periodo</span><span className={s.ctxV}>Presupuesto 2027</span></div>
      <label className={s.ctx}><span className={s.ctxK}>Versión</span><ScenarioSelect /></label>
      <div className={s.ctx}><span className={s.ctxK}>Moneda</span><span className={s.ctxV}>USD</span></div>
      <span className={s.flex} />
      {status}
      <button type="button" className={s.iconBtn} aria-label="Buscar"><Search size={20} /></button>
      <UserMenu />
    </header>
  )
}

/** Barra superior móvil (< 768): logo, contexto compacto y estado. */
export function MobileBar({ status }: { status?: ReactNode }) {
  const { session } = useAuth()
  return (
    <header className={s.mobileBar}>
      <div className={s.mobileRow}>
        <img className={s.mobileLogo} src="/brand/quadra-horizontal-negativo.svg" alt="QUADRA" />
        <span className={s.avatar} aria-hidden>{session?.user.email?.[0]?.toUpperCase() ?? 'Q'}</span>
      </div>
      <div className={s.mobileCtx}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span className="q-sr-only">Versión</span>
          <ScenarioSelect className={s.mobileSelect} />
          <ChevronDown size={14} color="var(--q-gray-blue)" aria-hidden style={{ marginLeft: -26, pointerEvents: 'none' }} />
        </label>
        {status}
      </div>
    </header>
  )
}
