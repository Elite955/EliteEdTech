import { useEffect, useState } from 'react'
import { api } from '../api/client'

export default function JoinClassDialog({ session, onClose }) {
  const [state, setState] = useState({ loading: true, error: '', joinUrl: '', status: '' })

  useEffect(() => {
    let active = true
    async function prepareMeeting() {
      try {
        const result = await api.post(`/sessions/${session.session_id}/meeting`)
        if (!active) return
        if (!result.joinUrl) {
          setState({
            loading: false,
            error: result.error || 'The meeting link is not ready yet. Please try again shortly.',
            status: result.status || '',
          })
          return
        }
        setState({ loading: false, error: '', joinUrl: result.joinUrl, status: result.status || 'ready' })
      } catch (error) {
        if (active) setState({ loading: false, error: error.message, status: '' })
      }
    }
    void prepareMeeting()
    return () => { active = false }
  }, [session.session_id])

  return (
    <div className="join-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="join-dialog" role="dialog" aria-modal="true" aria-labelledby="join-dialog-title">
        <div className="join-dialog-head">
          <div>
            <p className="join-dialog-label">Live class</p>
            <h2 id="join-dialog-title">Join your class</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Close join class dialog" onClick={onClose}>
            ×
          </button>
        </div>

        <p className="join-dialog-meta">
          {session.teacher?.name || 'Your teacher'}
          {session.date ? ` · ${session.date}` : ''}
          {session.start_time ? ` at ${session.start_time}` : ''}
        </p>

        {state.loading && (
          <div className="join-dialog-state">
            <span className="join-dialog-spinner" aria-hidden="true" />
            <p>Preparing your meeting…</p>
          </div>
        )}

        {!state.loading && state.error && (
          <div className="join-dialog-state">
            <div className="alert error">{state.error}</div>
            <p className="muted">You can close this window and try again when the meeting is ready.</p>
          </div>
        )}

        {!state.loading && state.joinUrl && (
          <div className="join-dialog-state">
            <div className="join-stage">
              <span className="join-stage-mark" aria-hidden="true">Z</span>
              <div>
                <strong>Zoom meeting ready</strong>
                <span>You are still inside the student portal.</span>
              </div>
            </div>
            <a className="btn" href={state.joinUrl} target="_blank" rel="noreferrer">
              Open Zoom meeting
            </a>
            <p className="muted">Zoom opens in a new tab. Keep this portal open to return to your session details.</p>
          </div>
        )}

        <div className="join-dialog-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Close</button>
        </div>
      </section>
    </div>
  )
}
