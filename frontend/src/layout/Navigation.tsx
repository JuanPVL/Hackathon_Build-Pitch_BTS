import { Fragment, useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Check, Ellipsis } from 'lucide-react'
import { NAV_ITEMS, STEP_GROUPS, groupForPath, visibleItems } from './navigation'
import s from './AppShell.module.css'

const linkClass = (base: string) => ({ isActive }: { isActive: boolean }) => `${base} ${isActive ? s.active : ''}`

/** Barra lateral de escritorio agrupada por los 5 pasos. */
export function Sidebar() {
  return (
    <aside className={s.sidebar} aria-label="Navegación principal">
      <img className={s.logo} src="/brand/quadra-horizontal-negativo.svg" alt="QUADRA" />
      <nav>
        {STEP_GROUPS.map(g => (
          <Fragment key={g.group}>
            <p className={s.groupLabel}>
              {g.step && <span className={s.stepDot}><Check size={12} aria-hidden /></span>}
              {g.label}
            </p>
            {visibleItems(g.group).map(item => (
              <NavLink key={item.path} to={item.path} end={item.path === '/'} className={linkClass(s.navLink)}>
                <item.icon size={18} aria-hidden />{item.label}
              </NavLink>
            ))}
          </Fragment>
        ))}
      </nav>
      <div className={s.sideFooter}>
        <span className={s.sideFooterK}>GRUPO DE PRUEBA (FICTICIO)</span>
        <span className={s.sideFooterV}>6 empresas · 3 monedas</span>
      </div>
    </aside>
  )
}

/** Riel de tableta: un ícono por paso; lleva a la primera pantalla del paso. */
export function Rail() {
  const active = groupForPath(useLocation().pathname)
  return (
    <nav className={s.rail} aria-label="Navegación principal">
      <img className={s.railLogo} src="/brand/quadra-simbolo-negativo.svg" alt="QUADRA" />
      {STEP_GROUPS.map(g => {
        const first = visibleItems(g.group)[0]
        return (
          <NavLink key={g.group} to={first.path} end={first.path === '/'} className={`${s.railLink} ${active === g.group ? s.active : ''}`} aria-current={active === g.group ? 'page' : undefined}>
            <first.icon size={20} aria-hidden />{g.label}
          </NavLink>
        )
      })}
    </nav>
  )
}

/** Barra inferior móvil: Inicio, Validar, Conciliar, Explicar y Más (≤ 5 pestañas). */
export function BottomNav() {
  const { pathname } = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  useEffect(() => setMoreOpen(false), [pathname])
  const tabs = NAV_ITEMS.filter(i => i.mobileTab)
  const extras = visibleItems().filter(i => !i.mobileTab)
  const extraActive = extras.some(i => pathname.startsWith(i.path))
  return (
    <>
      <nav className={s.bottomNav} aria-label="Navegación principal">
        {tabs.map(t => (
          <NavLink key={t.path} to={t.path} end={t.path === '/'} className={linkClass(s.tab)}>
            <t.icon size={22} aria-hidden />{STEP_GROUPS.find(g => g.group === t.group)!.label}
          </NavLink>
        ))}
        <button type="button" className={`${s.tab} ${extraActive ? s.active : ''}`} aria-haspopup="dialog" aria-expanded={moreOpen} onClick={() => setMoreOpen(true)}>
          <Ellipsis size={22} aria-hidden />Más
        </button>
      </nav>
      {moreOpen && (
        <div className={s.sheet} role="dialog" aria-modal="true" aria-label="Más secciones" onClick={() => setMoreOpen(false)} onKeyDown={e => e.key === 'Escape' && setMoreOpen(false)}>
          <div className={s.sheetPanel} onClick={e => e.stopPropagation()}>
            <span className={s.grabber} aria-hidden />
            {extras.map(i => (
              <NavLink key={i.path} to={i.path} className={s.sheetLink} autoFocus={i === extras[0]}>
                <i.icon size={20} aria-hidden />{i.label}
              </NavLink>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
