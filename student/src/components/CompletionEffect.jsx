import { useEffect, useState } from 'react'
import { playUiSound } from '../lib/sound'

const confetti = Array.from({ length: 14 })

function alreadyCelebrated(bookingId) {
  try {
    return window.sessionStorage.getItem(`edtech.booking-celebrated:${bookingId}`) === '1'
  } catch {
    return false
  }
}

export default function CompletionEffect({ bookingId, detail = 'Your class is complete.' }) {
  const [active] = useState(() => Boolean(bookingId) && !alreadyCelebrated(bookingId))
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (!active) return
    try {
      window.sessionStorage.setItem(`edtech.booking-celebrated:${bookingId}`, '1')
    } catch {}
    playUiSound('success')
    const timer = window.setTimeout(() => setVisible(false), 2800)
    return () => window.clearTimeout(timer)
  }, [active, bookingId])

  if (!active || !visible) return null

  return (
    <div className="completion-effect" role="status" aria-live="polite">
      <div className="completion-confetti" aria-hidden="true">
        {confetti.map((_, index) => (
          <span
            key={index}
            style={{
              left: `${5 + index * 6.4}%`,
              animationDelay: `${(index % 7) * -0.12}s`
            }}
          />
        ))}
      </div>
      <div className="completion-toast">
        <span className="completion-check" aria-hidden="true">✓</span>
        <div>
          <strong>Booking complete</strong>
          <span>{detail}</span>
        </div>
      </div>
    </div>
  )
}
