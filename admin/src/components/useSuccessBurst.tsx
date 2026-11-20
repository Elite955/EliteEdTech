import { useCallback, useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { playUiSound } from '../lib/sound'

type Burst = { id: number; title: string; detail?: string }

const confetti = Array.from({ length: 16 }, (_, index) => index)

export function useSuccessBurst() {
  const [burst, setBurst] = useState<Burst | null>(null)
  const counter = useRef(0)

  useEffect(() => {
    if (!burst) return
    const timer = window.setTimeout(() => setBurst(null), 2800)
    return () => window.clearTimeout(timer)
  }, [burst])

  const celebrate = useCallback((title: string, detail?: string) => {
    counter.current += 1
    playUiSound('success')
    setBurst({ id: counter.current, title, detail })
  }, [])

  const element = burst ? (
    <div className="success-burst" role="status" aria-live="polite">
      <div className="success-confetti" aria-hidden="true">
        {confetti.map((index) => (
          <span
            key={index}
            style={{
              left: `${3 + index * 5.9}%`,
              animationDelay: `${(index % 8) * 0.06}s`,
              animationDuration: `${1.4 + (index % 5) * 0.16}s`,
            }}
          />
        ))}
      </div>
      <div className="success-toast">
        <span className="success-check"><Check size={16} strokeWidth={3} /></span>
        <span>
          <strong>{burst.title}</strong>
          {burst.detail && <small>{burst.detail}</small>}
        </span>
      </div>
    </div>
  ) : null

  return { celebrate, burst: element }
}
