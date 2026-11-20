import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Figtree, as in smartLoad+ (owner, 20.11.2026): bundled with the app, so it works offline and in
// the desktop app; it has č ć š ž đ.
import '@fontsource-variable/figtree'
import './index.css'
import { ApiProvider } from './api/ApiProvider'
import { createApiClient } from './api/createApiClient'
import { AppRouter } from './app/AppRouter'
import { applyTheme, loadTheme } from './app/theme'
import { LastJobProvider } from './features/optimization/LastJobProvider'

// Before the first paint, so the chosen theme does not flash in after Višnja.
applyTheme(loadTheme())

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
