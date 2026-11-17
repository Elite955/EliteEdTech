import { useEffect, useState } from 'react'
import { api } from '../api/client'
import StatusBadge from '../components/StatusBadge'

export default function SessionHistory() {
  const [sessions, setSessions] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    api
      .get('/sessions/mine')
      .then((res) => setSessions(res.sessions || []))
      .catch((e) => setErr(e.message))
  }, [])

  return (
    <div>
      <h1>Session history</h1>
      <p className="page-sub">Attendance, duration and Zoom links for every class. Recordings appear only when consent was given.</p>

      {err && <div className="alert error">{err}</div>}

      {sessions === null ? (
        <div className="loading">Loading sessions…</div>
      ) : sessions.length === 0 ? (
        <div className="empty">No sessions yet.</div>
      ) : (
        <div className="slist">
          {sessions.map((s) => (
            <div key={s.booking_id} className="card session-card">
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
                  {s.meeting_url && (
                    <a className="btn small" href={s.meeting_url} target="_blank" rel="noreferrer">
                      Join on Zoom
                    </a>
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
    </div>
  )
}
