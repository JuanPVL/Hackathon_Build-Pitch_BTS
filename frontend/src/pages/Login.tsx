import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'

export function Login() {
  const { session, loading, error: sessionError } = useAuth()
  const location = useLocation()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const from = location.state?.from
  if (loading) return <div className="full-state" role="status">Recuperando sesión…</div>
  if (session) return <Navigate to={typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') && from !== '/login' ? from : '/'} replace />
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || busy) return
    const form = new FormData(event.currentTarget)
    setBusy(true); setError('')
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: String(form.get('email')).trim(), password: String(form.get('password')) })
      if (error) setError('No se pudo iniciar sesión. Revisa tus credenciales e inténtalo nuevamente.')
    } catch { setError('No se pudo conectar. Revisa tu conexión e inténtalo de nuevo.') }
    finally { setBusy(false) }
  }
  return <main className="login"><section className="login-story"><img src="/quadra.svg" alt="Quadra" /><div><p className="eyebrow">FINANZAS CON TRAZABILIDAD</p><h1>Todo el grupo.<br />Una sola visión.</h1><p>Consolida, concilia y entiende cada cifra de tu presupuesto.</p></div><small>Plataforma de consolidación financiera</small></section><section className="login-form"><form className="card" onSubmit={submit}><p className="eyebrow">BIENVENIDO A QUADRA</p><h2>Inicia sesión</h2><p>Ingresa con tu cuenta de trabajo.</p><label>Correo electrónico<input name="email" type="email" autoComplete="username" placeholder="nombre@empresa.com" required /></label><label>Contraseña<input name="password" type="password" autoComplete="current-password" required /></label>{!supabase && <p className="notice">Configura las variables de Supabase para habilitar el acceso.</p>}{(error || sessionError) && <p role="alert" className="error">{error || sessionError}</p>}<button disabled={busy || !supabase} type="submit">{busy ? 'Ingresando…' : 'Ingresar a Quadra'}</button></form></section></main>
}
