import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, Upload, ShieldCheck, ArrowLeftRight, Layers, ChartNoAxesCombined, LogOut } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'

export const modules = [
  { path: '/', title: 'Resumen', icon: LayoutDashboard, description: 'La visión financiera del grupo, en un solo lugar.' },
  { path: '/cargas', title: 'Cargas de datos', icon: Upload, description: 'Presupuestos y balances por empresa y escenario.' },
  { path: '/validaciones', title: 'Validaciones', icon: ShieldCheck, description: 'Hallazgos y reglas de calidad antes de consolidar.' },
  { path: '/intercompany', title: 'Intercompany', icon: ArrowLeftRight, description: 'Conciliación de operaciones entre empresas del grupo.' },
  { path: '/consolidacion', title: 'Consolidación', icon: Layers, description: 'Conversión a USD, eliminaciones y trazabilidad.' },
  { path: '/comparativo', title: 'Comparativo', icon: ChartNoAxesCombined, description: 'Variaciones entre escenarios y explicación de resultados.' },
]
export function AppLayout() {
  const { session } = useAuth()
  const [error, setError] = useState('')
  async function logout() {
    const { error } = await supabase!.auth.signOut()
    if (error) setError('No se pudo cerrar sesión. Intenta nuevamente.')
  }
  return <div className="app-shell"><aside className="sidebar"><img className="brand" src="/quadra.svg" alt="Quadra" /><p className="nav-label">ESPACIO FINANCIERO</p><nav aria-label="Navegación principal">{modules.map(({ path, title, icon: Icon }) => <NavLink key={path} to={path} end={path === '/'}><Icon size={19} />{title}</NavLink>)}</nav><div className="sidebar-footer"><span className="avatar">{session?.user.email?.[0]?.toUpperCase() || 'Q'}</span><span className="user-email">{session?.user.email}</span><button className="icon-button" aria-label="Cerrar sesión" onClick={logout}><LogOut size={18} /></button></div>{error && <p role="alert" className="error">{error}</p>}</aside><div className="workspace"><header className="topbar"><span>Consolidación de presupuesto</span><span className="badge">Moneda de grupo · USD</span></header><main className="content"><Outlet /></main><footer className="footer">Quadra · Consolidación financiera de grupo</footer></div></div>
}
