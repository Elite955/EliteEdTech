import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import StatusBadge from '../components/StatusBadge'

export default function Dashboard() {
  const [bookings, setBookings] = useState(null)
  const [sessions, setSessions] = useState(null)

  useEffect(() => {
    api.get('/bookings/mine').then((res) => setBookings(res.bookings || [])).catch(() => setBookings([]))
    api.get('/sessions/mine').then((res) => setSessions(res.sessions || [])).catch(() => setSessions([]))
  }, [])

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

      <div className="cards">
        <div className="card stat">
          <div className="num">{pending}</div>
          <div className="lbl">Pending teacher approval</div>
          <Link to="/bookings">View bookings →</Link>
        </div>
        <div className="card stat">
          <div className="num">{awaiting}</div>
          <div className="lbl">Approved, awaiting payment</div>
          <Link to="/bookings">Pay now →</Link>
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
                      <Link className="btn small" to="/bookings">
                        Pay now
                      </Link>
                    )}
                    {session?.meeting_url && (
                      <a className="btn small ghost" href={session.meeting_url} target="_blank" rel="noreferrer" style={{ marginLeft: 8 }}>
                        Join on Zoom
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
