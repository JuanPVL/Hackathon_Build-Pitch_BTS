import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/shared/theme'
import { AppProviders } from '@/app/providers'
import { AppRoutes } from '@/app/router'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <AppRoutes />
    </AppProviders>
  </StrictMode>,
)
