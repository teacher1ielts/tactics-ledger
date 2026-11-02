import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import ErrorBoundary from './ErrorBoundary'
import './styles.css'
import './cyber.css'
import './fx.css'
import './clear.css'
import './tactics.css'

// apply the saved theme before the first paint (also used by the crash screen)
try {
  const saved = localStorage.getItem('tl-theme3')
  document.documentElement.dataset.theme = saved === 'cyber' || saved === 'clear' ? saved : 'tactics'
} catch {
  document.documentElement.dataset.theme = 'tactics'
}

registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
