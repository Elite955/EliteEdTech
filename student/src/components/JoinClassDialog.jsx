import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import SharedWhiteboard from './SharedWhiteboard'

const JITSI_DOMAIN = 'meet.jit.si'
const jitsiApiPromises = new Map()

function loadJitsiApi(domain = JITSI_DOMAIN) {
  if (typeof window.JitsiMeetExternalAPI === 'function') return Promise.resolve()
  if (!jitsiApiPromises.has(domain)) {
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = `https://${domain}/external_api.js`
      script.async = true
      script.onload = resolve
      script.onerror = () => {
        script.remove()
        reject(new Error('Jitsi could not be loaded. Check your connection and try again.'))
      }
      document.head.appendChild(script)
    }).catch((error) => {
      jitsiApiPromises.delete(domain)
      throw error
    })
    jitsiApiPromises.set(domain, promise)
  }
  return jitsiApiPromises.get(domain)
}

function getJitsiRoomName(joinUrl) {
  try {
    const url = new URL(joinUrl)
    const path = url.pathname.split('/').filter(Boolean)
    if (url.protocol !== 'https:' || url.hostname !== JITSI_DOMAIN || path.length !== 1) return ''
    return path[0]
  } catch (error) {
    if (error instanceof TypeError) return ''
    throw error
  }
}

function JitsiMeeting({ roomName, displayName, jaas, onError }) {
  const containerRef = useRef(null)

  useEffect(() => {
    let active = true
    let meetingApi = null
    const domain = jaas?.domain || JITSI_DOMAIN
    loadJitsiApi(domain)
      .then(() => {
        if (!active || !containerRef.current) return
        if (typeof window.JitsiMeetExternalAPI !== 'function') {
          throw new Error('Jitsi could not be initialized.')
        }
        meetingApi = new window.JitsiMeetExternalAPI(domain, {
          roomName: jaas?.roomName || roomName,
          jwt: jaas?.jwt,
          width: '100%',
          height: '100%',
          parentNode: containerRef.current,
          userInfo: displayName ? { displayName } : undefined,
          lang: 'en',
          configOverwrite: {
            prejoinPageEnabled: false,
            disableDeepLinking: true,
          },
          interfaceConfigOverwrite: {
            TILE_VIEW_MAX_COLUMNS: 2,
            TOOLBAR_BUTTONS: [
              'microphone',
              'camera',
              'desktop',
              'tileview',
              'fullscreen',
              'hangup',
            ],
          },
        })
      })
      .catch(() => {
        if (active) onError('Jitsi could not open inside the portal. You can open the meeting in a new tab instead.')
      })

    return () => {
      active = false
      meetingApi?.dispose()
    }
  }, [displayName, jaas, onError, roomName])

  return <div ref={containerRef} className="jitsi-meeting-embed" aria-label="Jitsi class meeting" />
}

export default function JoinClassDialog({ session, onClose }) {
  const { user } = useAuth()
  const [state, setState] = useState({ loading: true, error: '', joinUrl: '', status: '', jaas: null })
  const [jitsiError, setJitsiError] = useState('')

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
        setState({ loading: false, error: '', joinUrl: result.joinUrl, status: result.status || 'ready', jaas: result.jaas || null })
      } catch (error) {
        if (active) setState({ loading: false, error: error.message, status: '' })
      }
    }
    void prepareMeeting()
    return () => { active = false }
  }, [session.session_id])

  const jitsiRoomName = state.jaas?.roomName || (state.joinUrl ? getJitsiRoomName(state.joinUrl) : '')
  const isJitsi = Boolean(jitsiRoomName)
  const providerName = isJitsi
    ? 'Jitsi Meet'
    : session.meeting_provider === 'zoom'
      ? 'Zoom'
      : session.meeting_provider === 'google_meet'
        ? 'Google Meet'
        : 'video meeting'

  return (
    <div className="join-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className={`join-dialog${isJitsi ? ' join-dialog--embedded' : ''}`} role="dialog" aria-modal="true" aria-labelledby="join-dialog-title">
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
          <div className={`join-dialog-state${isJitsi ? ' join-dialog-state--embedded' : ''}`}>
            {isJitsi ? (
              <div className="classroom-split">
                <SharedWhiteboard sessionId={session.session_id} />
                <div className="classroom-video">
                  {jitsiError ? (
                    <div className="alert error" role="alert">
                      {jitsiError}{' '}
                      <a href={state.joinUrl} target="_blank" rel="noopener noreferrer">Open Jitsi in a new tab</a>
                    </div>
                  ) : (
                    <JitsiMeeting
                      roomName={jitsiRoomName}
                      jaas={state.jaas}
                      displayName={user?.name}
                      onError={setJitsiError}
                    />
                  )}
                  {!jitsiError && (
                    <p className="muted">
                      If your teacher shares a board-only tab in Jitsi, you can see it in the call. The board is also
                      available beside the video here.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="join-stage">
                  <span className="join-stage-mark" aria-hidden="true">V</span>
                  <div>
                    <strong>{providerName} meeting ready</strong>
                    <span>You are still inside the student portal.</span>
                  </div>
                </div>
                <a className="btn" href={state.joinUrl} target="_blank" rel="noopener noreferrer">
                  Open {providerName} meeting
                </a>
                <p className="muted">{providerName} opens in a new tab. Keep this portal open to return to your session details.</p>
              </>
            )}
          </div>
        )}

        <div className="join-dialog-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Close</button>
        </div>
      </section>
    </div>
  )
}
