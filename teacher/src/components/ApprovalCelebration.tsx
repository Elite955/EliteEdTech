import { Check } from 'lucide-react'

const confetti = Array.from({ length: 18 }, (_, index) => index)

export function ApprovalCelebration({ studentName }: { studentName: string }) {
  return (
    <div className="approval-celebration" role="status" aria-live="polite">
      <div className="approval-confetti" aria-hidden="true">
        {confetti.map((index) => (
          <span
            key={index}
            style={{
              left: `${4 + index * 5.3}%`,
              animationDelay: `${(index % 9) * 0.07}s`,
              animationDuration: `${1.5 + (index % 5) * 0.18}s`,
            }}
          />
        ))}
      </div>
      <div className="approval-toast">
        <span className="approval-check"><Check size={17} strokeWidth={3} /></span>
        <span>
          <strong>Booking approved</strong>
          <small>{studentName}&rsquo;s session is confirmed.</small>
        </span>
      </div>
    </div>
  )
}
