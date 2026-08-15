import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { asset } from './lib/asset'
import { applySavedTheme } from './screens/Menu'
import './styles/global.css'

// Before the first paint, so an explicit theme choice never flashes the
// system default first.
applySavedTheme()

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root is missing from index.html')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Registered after load so fetching and installing the worker never competes
// with the first render for bandwidth.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(asset('sw.js'), { scope: import.meta.env.BASE_URL }).catch(() => {
      // Offline support is a bonus; the game works without it.
    })
  })
}
