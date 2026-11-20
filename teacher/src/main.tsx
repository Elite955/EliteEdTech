import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { installUiSounds } from './lib/sound'
import './index.css'

installUiSounds()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
