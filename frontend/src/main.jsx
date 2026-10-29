import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App.jsx'
import './styles/tailwind.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Deskflow could not find its root element.')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
