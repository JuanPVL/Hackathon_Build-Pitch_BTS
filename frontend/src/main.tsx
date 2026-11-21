import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, ProtectedRoute } from './auth/AuthProvider'
import { AppLayout, modules } from './components/AppLayout'
import { Login } from './pages/Login'
import { ModulePage } from './pages/ModulePage'
import './styles.css'

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30000, retry: 1, refetchOnWindowFocus: false } } })
createRoot(document.getElementById('root')!).render(
  <StrictMode><QueryClientProvider client={queryClient}><BrowserRouter><AuthProvider><Routes>
    <Route path="/login" element={<Login />} />
    <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
      {modules.map(module => <Route key={module.path} path={module.path} element={<ModulePage path={module.path} />} />)}
    </Route>
    <Route path="*" element={<main className="full-state"><div><h1>Página no encontrada</h1><Link to="/">Volver al inicio</Link></div></main>} />
  </Routes></AuthProvider></BrowserRouter></QueryClientProvider></StrictMode>,
)
