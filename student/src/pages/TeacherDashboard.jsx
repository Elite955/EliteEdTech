import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import StatusBadge from '../components/StatusBadge'
import { playUiSound } from '../lib/sound'

const EARNED = new Set(['approved', 'paid', 'completed'])

export default function TeacherDashboard() {
  const { user } = useAuth()
  const [profile, setProfile] = useState(null)
  const [bookings, setBookings] = useState([])
  const [err, setErr] = useState('')
  const [busyId, setBusyId] = useState(null)

  async function load() {
    try {
      const [p, b] = await Promise.all([api.get('/teacher/profile'), api.get('/teacher/bookings')])
      setProfile(p.profile)
      setBookings(b.bookings || [])
    } catch (e) {
      setErr(e.message)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function decide(id, action) {
    setBusyId(id)
    setErr('')
    try {
      const res = await api.patch(`/teacher/bookings/${id}`, { action })
      setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status: res.booking.status } : b)))
      playUiSound('success')
    } catch (e) {
      setErr(e.message)
      playUiSound('error')
    } finally {
      setBusyId(null)
    }
  }

  const pending = bookings.filter((b) => b.status === 'pending')
  const history = bookings.filter((b) => b.status !== 'pending')
  const earnings = bookings
    .filter((b) => EARNED.has(b.status))
    .reduce((sum, b) => sum + b.amount, 0)

  return (
    <div>
      <h1>Teacher dashboard</h1>
      <p className="page-sub">
        {profile
          ? `${profile.name} — ₹${profile.hourly_rate}/hour · ${(profile.subjects || []).join(', ')}`
          : 'Loading profile…'}
      </p>

      {err && <div className="alert error">{err}</div>}

      <div className="stat-row" style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
        <div className="card" style={{ flex: 1 }}>
          <p className="muted" style={{ marginBottom: 4 }}>Pending requests</p>
          <h2 style={{ margin: 0 }}>{pending.length}</h2>
        </div>
        <div className="card" style={{ flex: 1 }}>
          <p className="muted" style={{ marginBottom: 4 }}>Confirmed earnings</p>
          <h2 style={{ margin: 0 }}>₹{earnings.toFixed(2)}</h2>
        </div>
        <div className="card" style={{ flex: 1 }}>
          <p className="muted" style={{ marginBottom: 4 }}>Profile status</p>
          <h2 style={{ margin: 0 }}>{profile?.approved ? 'Approved' : 'Awaiting review'}</h2>
        </div>
      </div>

      <h2 style={{ fontSize: 18 }}>Pending booking requests</h2>
      {pending.length === 0 ? (
        <p className="muted">No pending requests right now.</p>
      ) : (
        <div className="card" style={{ marginBottom: 20 }}>
          {pending.map((b) => (
            <div key={b.id} className="spread" style={{ padding: '10px 0', borderBottom: '1px solid #e2e8f0' }}>
              <div>
                <strong>{b.student?.name || 'Student'}</strong> — {b.date} {b.start_time}–{b.end_time}
                <div className="muted">₹{b.amount}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn small" disabled={busyId === b.id} onClick={() => decide(b.id, 'approve')}>
                  Approve
                </button>
                <button className="btn small" style={{ background: '#b91c1c' }} disabled={busyId === b.id} onClick={() => decide(b.id, 'reject')}>
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 style={{ fontSize: 18 }}>Booking history</h2>
      {history.length === 0 ? (
        <p className="muted">No bookings yet.</p>
      ) : (
        <div className="card">
          {history.map((b) => (
            <div key={b.id} className="spread" style={{ padding: '10px 0', borderBottom: '1px solid #e2e8f0' }}>
              <div>
                <strong>{b.student?.name || 'Student'}</strong> — {b.date} {b.start_time}–{b.end_time}
                <div className="muted">₹{b.amount}</div>
              </div>
              <StatusBadge status={b.status} />
            </div>
          ))}
        </div>
      )}

      <p className="muted" style={{ marginTop: 16, fontSize: 13 }}>
        Signed in as {user?.email}. Availability defaults to Mon–Fri, 4–6 PM and 7–9 PM (IST).
      </p>
    </div>
  )
}
