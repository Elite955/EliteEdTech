import { useEffect, useState } from 'react'

export const ELITE_LOADER_MS = 3600
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
    const duration = ELITE_LOADER_MS
    const start = performance.now()
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1)
      setProgress(Math.round((1 - Math.pow(1 - t, 2.4)) * 100))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div className="elite-loader" role="status" aria-live="polite">
      <div className="elite-loader-stage">
        <div className="elite-loader-logo" role="img" aria-label="Elite">
          <div className="elite-loader-sheen" />
        </div>
        <div className="elite-loader-meter">
          <div className="elite-loader-track" role="progressbar" aria-label="Loading" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress}>
            <div className="elite-loader-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="elite-loader-status">
            <span>{label}</span>
            <output>{progress}%</output>
          </div>
        </div>
      </div>
    </div>
  )
}
