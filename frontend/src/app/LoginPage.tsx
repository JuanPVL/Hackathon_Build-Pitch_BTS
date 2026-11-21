import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Check } from 'lucide-react'
import { useAuth } from '@/shared/auth'
import { Button, Callout, FullState } from '@/shared/ui'
import s from './LoginPage.module.css'

function safeRedirect(from: unknown): string {
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') && from !== '/login' ? from : '/'
}

export function LoginPage() {
  const { session, loading, error: sessionError, unconfigured, signIn } = useAuth()
  const location = useLocation()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (loading) return <FullState title="Recuperando sesión…" busy />
  if (session) return <Navigate to={safeRedirect(location.state?.from)} replace />

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const form = new FormData(event.currentTarget)
    setBusy(true); setError(null)
    setError(await signIn(String(form.get('email')), String(form.get('password'))))
    setBusy(false)
  }

  return (
    <main className={s.login}>
      <section className={s.story}>
        <img src="/brand/quadra-horizontal-negativo.svg" alt="QUADRA" width={180} height={41} />
        <div className={s.storyText}>
          <p className={s.eyebrow}>MULTIEMPRESA · MULTIMONEDA · MULTIPAÍS</p>
          <h1>Conciliación intercompany que <span>cuadra sola.</span></h1>
          <p>Cada factura nace en pareja: lo que las empresas del grupo se facturan, se deben y se venden entre sí, conciliado sin contarlo dos veces.</p>
          <ul className={s.chips}>
            {['Una sola llave', 'Sin doble conteo', 'Cada diferencia con su causa'].map(t => <li key={t}><Check size={13} aria-hidden />{t}</li>)}
          </ul>
        </div>
      </section>
      <section className={s.formSide}>
        <form className={s.card} onSubmit={submit} noValidate={false}>
          <p className={s.formEyebrow}>BIENVENIDO A QUADRA</p>
          <h2>Inicia sesión</h2>
          <p className={s.muted}>Ingresa con tu cuenta de trabajo.</p>
          <label className={s.field}>Correo electrónico
            <input name="email" type="email" autoComplete="username" placeholder="nombre@empresa.com" required />
          </label>
          <label className={s.field}>Contraseña
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          {unconfigured && <Callout tone="neutral">Configura las variables de Supabase para habilitar el acceso.</Callout>}
          {(error || sessionError) && <Callout tone="err">{error || sessionError}</Callout>}
          <Button type="submit" variant="primary" block disabled={busy || unconfigured}>{busy ? 'Ingresando…' : 'Ingresar a QUADRA'}</Button>
        </form>
      </section>
    </main>
  )
}
