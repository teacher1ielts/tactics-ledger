import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import ErrorBoundary from './ErrorBoundary'
import './styles.css'
import './cyber.css'
import './fx.css'

// apply the saved theme before the first paint (also used by the crash screen)
try {
  document.documentElement.dataset.theme = localStorage.getItem('tl-theme') === 'tactics' ? 'tactics' : 'cyber'
} catch {
  document.documentElement.dataset.theme = 'cyber'
}

registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
