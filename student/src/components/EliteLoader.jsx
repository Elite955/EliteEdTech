import { useEffect, useState } from 'react'

export const ELITE_LOADER_MS = 3500
const ELITE_LOADER_SETTLE_MS = 250

export function waitForEliteLoader(startedAt) {
  return new Promise((resolve) => {
    const wait = ELITE_LOADER_MS + ELITE_LOADER_SETTLE_MS - (performance.now() - startedAt)
    setTimeout(resolve, Math.max(0, wait))
  })
}

export default function EliteLoader({ label = 'Loading' }) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    let frame = 0
    const start = performance.now()
    const tick = (now) => {
      const t = Math.min((now - start) / ELITE_LOADER_MS, 1)
      setProgress(Math.round((1 - Math.pow(1 - t, 2.2)) * 100))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div className="elite-loader" role="status" aria-live="polite" aria-label={label}>
      <div className="elite-loader-logo">
        <img className="elite-loader-logo-img" src="/elite-logo-lg.png" alt="Elite" />
      </div>
      <div className="elite-loader-progress">
        <div className="elite-loader-progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <div className="elite-loader-status">{progress}%</div>
    </div>
  )
}
