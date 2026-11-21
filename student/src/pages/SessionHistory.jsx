import { useEffect, useState } from 'react'
import { api } from '../api/client'
import StatusBadge from '../components/StatusBadge'
import CompletionEffect from '../components/CompletionEffect'
import JoinClassDialog from '../components/JoinClassDialog'

function SessionCountdown({ startAt }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, new Date(startAt).getTime() - Date.now()))

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRemaining(Math.max(0, new Date(startAt).getTime() - Date.now()))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [startAt])

  if (remaining <= 0) return <span>Session has started</span>
  const seconds = Math.floor(remaining / 1000)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  return <span>Starts in {hours}h {minutes}m {secs}s</span>
}

export default function SessionHistory() {
  const [sessions, setSessions] = useState(null)
  const [err, setErr] = useState('')
  const [joining, setJoining] = useState(null)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    api
      .get('/sessions/mine')
      .then((res) => setSessions(res.sessions || []))
      .catch((e) => setErr(e.message))
  }, [])

  return (
    <div>
      <h1>Session history</h1>
      <p className="page-sub">Attendance, duration and meeting links for every class. Recordings appear only when consent was given.</p>

      {err && <div className="alert error">{err}</div>}

      {sessions === null ? (
        <div className="loading">Loading sessions…</div>
      ) : sessions.length === 0 ? (
        <div className="empty">No sessions yet.</div>
      ) : (
        <div className="slist">
          {sessions.map((s) => (
            <div key={s.booking_id} className="card session-card">
              {s.status === 'completed' && (
                <CompletionEffect bookingId={s.booking_id} detail={`Class with ${s.teacher?.name || 'your teacher'} is in the books.`} />
              )}
              <div className="spread">
                <div>
                  <strong>{s.teacher?.name || 'Teacher'}</strong> <StatusBadge status={s.status || 'completed'} />
                  <div className="meta">
                    <span>{s.date}</span>
                    <span>
                      {s.started_at ? new Date(s.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                      {' – '}
                      {s.ended_at ? new Date(s.ended_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </span>
                    {s.duration_minutes != null && <span>Duration: {s.duration_minutes} min</span>}
                    {s.attendance_count != null && <span>Attendance: {s.attendance_count}</span>}
                  </div>
                </div>
                <div className="row">
                  {s.session_id && ['scheduled', 'ongoing'].includes(s.status) && !['cancelled', 'rejected', 'completed'].includes(s.booking_status) && (
                    <>
                      {s.start_at && (
                        <span className="muted"><SessionCountdown startAt={s.start_at} /></span>
                      )}
                      <button
                        className="btn small"
                        type="button"
                        disabled={Boolean(s.start_at && now < new Date(s.start_at).getTime())}
                        onClick={() => setJoining(s)}
                      >
                        Join class
                      </button>
                    </>
                  )}
                  {s.recording_consent && s.recording_url ? (
                    <a className="btn small ghost" href={s.recording_url} target="_blank" rel="noreferrer">
                      Watch recording
                    </a>
                  ) : (
                    <span className="muted">No recording (consent not given)</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {joining && <JoinClassDialog session={joining} onClose={() => setJoining(null)} />}
    </div>
  )
}
