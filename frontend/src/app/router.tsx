import { lazy } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AppShell } from '@/layout/AppShell'
import { BackendAccess } from '@/shared/auth/BackendAccess'
import { ProtectedRoute } from '@/shared/auth'
import { ButtonLink, FullState } from '@/shared/ui'
import { PublicationStatus } from '@/features/validation'
import { LoginPage } from './LoginPage'

// Cada módulo se carga por separado (code splitting por ruta).
const RunPage = lazy(() => import('@/features/backend/RunPage'))
const LoadPage = lazy(() => import('@/features/backend/LoadPage'))
const ConsolidationPage = lazy(() => import('@/features/consolidation/ConsolidationPage'))
const ValidationPage = lazy(() => import('@/features/validation/ValidationPage'))
const ReconciliationPage = lazy(() => import('@/features/reconciliation/ReconciliationPage'))
const CurrentAccountPage = lazy(() => import('@/features/current-account/CurrentAccountPage'))
const IcDocumentPage = lazy(() => import('@/features/ic-document/IcDocumentPage'))
const RatesPage = lazy(() => import('@/features/rates/RatesPage'))
const EliminationsPage = lazy(() => import('@/features/eliminations/EliminationsPage'))
const ProfitabilityPage = lazy(() => import('@/features/profitability/ProfitabilityPage'))
const VariancePage = lazy(() => import('@/features/variance/VariancePage'))

function NotFound() {
  return <FullState title="Página no encontrada" action={<ButtonLink to="/" variant="primary">Volver al inicio</ButtonLink>}>La dirección no existe o cambió.</FullState>
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute><BackendAccess><AppShell status={<PublicationStatus />} /></BackendAccess></ProtectedRoute>}>
        <Route index element={<ConsolidationPage />} />
        <Route path="corridas/:runId" element={<RunPage />} />
        <Route path="cargas/:loadId" element={<LoadPage />} />
        <Route path="validacion" element={<ValidationPage />} />
        <Route path="conciliacion" element={<ReconciliationPage />} />
        <Route path="cuenta-corriente" element={<CurrentAccountPage />} />
        <Route path="documentos/:key" element={<IcDocumentPage />} />
        <Route path="tasas" element={<RatesPage />} />
        <Route path="eliminaciones" element={<EliminationsPage />} />
        <Route path="rentabilidad" element={<ProfitabilityPage />} />
        <Route path="desviaciones" element={<VariancePage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
