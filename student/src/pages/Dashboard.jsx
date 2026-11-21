import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { startRazorpayCheckout } from '../lib/razorpay'
import { playUiSound } from '../lib/sound'
import StatusBadge from '../components/StatusBadge'
import JoinClassDialog from '../components/JoinClassDialog'

export default function Dashboard() {
  const { user } = useAuth()
  const [bookings, setBookings] = useState(null)
  const [sessions, setSessions] = useState(null)
  const [payingId, setPayingId] = useState(null)
  const [joining, setJoining] = useState(null)
  const [error, setError] = useState('')

  const load = () => {
    api.get('/bookings/mine').then((res) => setBookings(res.bookings || [])).catch(() => setBookings([]))
    api.get('/sessions/mine').then((res) => setSessions(res.sessions || [])).catch(() => setSessions([]))
  }

  useEffect(() => {
    load()
  }, [])

  async function payNow(booking) {
    setPayingId(booking.id)
    setError('')
    try {
      const result = await startRazorpayCheckout(booking, user, { onSuccess: load })
      if (result instanceof Error) setError(`Payment verification failed: ${result.message}`)
    } catch (e) {
      setError(e.message)
      playUiSound('error')
    } finally {
      setPayingId(null)
    }
  }

  const all = bookings || []
  const pending = all.filter((b) => b.status === 'pending').length
  const awaiting = all.filter((b) => b.status === 'approved').length
  const upcoming = all
    .filter((b) => ['approved', 'paid'].includes(b.status))
    .sort((a, b) => `${a.date}${a.start_time}`.localeCompare(`${b.date}${b.start_time}`))
    .slice(0, 3)
  const sessionByBooking = new Map((sessions || []).map((s) => [s.booking_id, s]))

  return (
    <div>
      <h1>Dashboard</h1>
      <p className="page-sub">Welcome back — here is where your learning stands.</p>
      {error && <div className="alert error">{error}</div>}

      <div className="cards">
        <div className="card stat">
          <div className="num">{pending}</div>
          <div className="lbl">Pending teacher approval</div>
          <Link to="/bookings">View bookings →</Link>
        </div>
        <div className="card stat">
          <div className="num">{awaiting}</div>
          <div className="lbl">Approved, awaiting payment</div>
          {awaiting > 0 ? (
            <button
              type="button"
              className="link-button"
              disabled={payingId !== null}
              onClick={() => payNow(all.find((booking) => booking.status === 'approved'))}
            >
              {payingId ? 'Opening checkout…' : 'Pay now →'}
            </button>
          ) : (
            <Link to="/bookings">View bookings →</Link>
          )}
        </div>
        <div className="card stat">
          <div className="num">{sessions?.length ?? '…'}</div>
          <div className="lbl">Completed sessions</div>
          <Link to="/sessions">Session history →</Link>
        </div>
      </div>

      <h2 style={{ marginTop: 28 }}>Up next</h2>
      <div className="slist">
        {upcoming.length === 0 ? (
          <div className="card empty">
            No confirmed classes yet. <Link className="link" to="/teachers">Browse teachers</Link> and request a slot.
          </div>
        ) : (
          upcoming.map((b) => {
            const session = sessionByBooking.get(b.id)
            return (
              <div key={b.id} className="card session-card">
                <div className="spread">
                  <div>
                    <strong>{b.teacher?.name || 'Teacher'}</strong>{' '}
                    <StatusBadge status={b.status} />
                    <div className="muted" style={{ marginTop: 6 }}>
                      {b.date} · {b.start_time}–{b.end_time} · ₹{b.amount}
                    </div>
                  </div>
                  <div>
                    {b.status === 'approved' && (
                      <button
                        className="btn small"
                        type="button"
                        disabled={payingId === b.id}
                        onClick={() => payNow(b)}
                      >
                        {payingId === b.id ? 'Opening checkout…' : 'Pay now'}
                      </button>
                    )}
                    {session?.session_id && (session.meeting_url || b.status === 'paid') && (
                      <button
                        className="btn small ghost"
                        type="button"
                        onClick={() => setJoining(session)}
                        style={{ marginLeft: 8 }}
                      >
                        Join class
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
      {joining && <JoinClassDialog session={joining} onClose={() => setJoining(null)} />}
    </div>
  )
}
