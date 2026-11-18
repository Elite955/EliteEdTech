import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { playUiSound } from '../lib/sound'
import { startRazorpayCheckout } from '../lib/razorpay'
import StatusBadge from '../components/StatusBadge'
import CompletionEffect from '../components/CompletionEffect'

export default function MyBookings() {
  const { user } = useAuth()
  const [bookings, setBookings] = useState(null)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const [payingId, setPayingId] = useState(null)

  const load = () =>
    api
      .get('/bookings/mine')
      .then((res) => setBookings(res.bookings || []))
      .catch((e) => setErr(e.message))

  useEffect(() => {
    load()
    const interval = window.setInterval(load, 5000)
    const refresh = () => load()
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  async function payNow(booking) {
    setPayingId(booking.id)
    setErr('')
    setNote('')
    try {
      const result = await startRazorpayCheckout(booking, user, {
        onSuccess: () => {
          setNote(`Payment successful — booking #${booking.id} is confirmed. See it under Sessions once scheduled.`)
          load()
        }
      })
      if (result instanceof Error) setErr(`Payment verification failed: ${result.message}`)
    } catch (e) {
      setErr(e.message)
      playUiSound('error')
    } finally {
      setPayingId(null)
    }
  }

  return (
    <div>
      <h1>My bookings</h1>
      <p className="page-sub">Track every request from pending approval to completed class.</p>

      {err && <div className="alert error">{err}</div>}
      {note && <div className="alert success">{note}</div>}

      {bookings === null ? (
        <div className="loading">Loading bookings…</div>
      ) : bookings.length === 0 ? (
        <div className="card empty">
          No bookings yet. <Link className="link" to="/teachers">Browse teachers</Link> to request your first slot.
        </div>
      ) : (
        <div className="slist">
          {bookings.map((b) => (
            <div key={b.id} className="card session-card">
              {b.status === 'completed' && (
                <CompletionEffect bookingId={b.id} detail={`Your session with ${b.teacher?.name || 'your teacher'} is complete.`} />
              )}
              <div className="spread">
                <div>
                  <strong>{b.teacher?.name || 'Teacher'}</strong> <StatusBadge status={b.status} />
                  <div className="muted" style={{ marginTop: 6 }}>
                    {b.date} · {b.start_time}–{b.end_time}
                    {b.amount != null && <> · ₹{b.amount}</>}
                  </div>
                </div>
                <div className="row">
                  {b.status === 'pending' && <span className="muted">Waiting for teacher approval</span>}
                  {b.status === 'rejected' && <span className="muted">The teacher declined this request</span>}
                  {b.status === 'approved' && (
                    <button className="btn small" disabled={payingId === b.id} onClick={() => payNow(b)}>
                      {payingId === b.id ? 'Opening checkout…' : 'Pay now'}
                    </button>
                  )}
                  {b.status === 'paid' && <span className="muted">Paid — class confirmed</span>}
                  {b.status === 'completed' && (
                    <Link className="btn small ghost" to={`/feedback?booking=${b.id}`}>
                      Leave feedback
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
