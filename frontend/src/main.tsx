import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { ApiProvider } from './api/ApiProvider'
import { createApiClient } from './api/createApiClient'
import { AppRouter } from './app/AppRouter'
import { LastJobProvider } from './features/optimization/LastJobProvider'

const apiClient = createApiClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ApiProvider client={apiClient}>
      <LastJobProvider>
        <AppRouter />
      </LastJobProvider>
    </ApiProvider>
  </StrictMode>,
)
