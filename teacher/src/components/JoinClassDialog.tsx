import { useEffect, useRef, useState } from 'react'
import { ExternalLink, Video, X } from 'lucide-react'
import { api, getErrorMessage } from '../lib/api'
import { useAuth } from '../auth/useAuth'
import { SharedWhiteboard } from './SharedWhiteboard'
import type { ClassSession } from '../lib/types'

const JITSI_DOMAIN = 'meet.jit.si'

interface JitsiApiOptions {
  roomName: string
  width: string
  height: string
  parentNode: HTMLElement
  userInfo?: { displayName: string }
  lang: string
  configOverwrite?: Record<string, unknown>
  interfaceConfigOverwrite?: Record<string, unknown>
}

declare global {
  interface Window {
    JitsiMeetExternalAPI?: new (domain: string, options: JitsiApiOptions) => { dispose: () => void }
  }
}

type MeetingReply = {
  status: string
  joinUrl: string | null
  meetingId: string | null
  error: string | null
}

let jitsiApiScript: Promise<void> | null = null

function loadJitsiApi(): Promise<void> {
  if (typeof window.JitsiMeetExternalAPI === 'function') return Promise.resolve()
  if (!jitsiApiScript) {
    jitsiApiScript = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script')
      script.src = `https://${JITSI_DOMAIN}/external_api.js`
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => {
        script.remove()
        reject(new Error('Jitsi could not be loaded.'))
      }
      document.head.appendChild(script)
    }).catch((error: unknown) => {
      jitsiApiScript = null
      throw error
    })
  }
  return jitsiApiScript
}

function jitsiRoomName(joinUrl: string | null): string {
  if (!joinUrl) return ''
  try {
    const url = new URL(joinUrl)
    const path = url.pathname.split('/').filter(Boolean)
    return url.protocol === 'https:' && url.hostname === JITSI_DOMAIN && path.length === 1 ? path[0] : ''
  } catch (error) {
    if (error instanceof TypeError) return ''
    throw error
  }
}

function JitsiMeetingFrame({
  roomName,
  displayName,
  onError,
}: {
  roomName: string
  displayName?: string
  onError: (message: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    let meetingApi: { dispose: () => void } | null = null
    void loadJitsiApi()
      .then(() => {
        if (!active || !containerRef.current) return
        if (!window.JitsiMeetExternalAPI) throw new Error('Jitsi could not be initialized.')
        meetingApi = new window.JitsiMeetExternalAPI(JITSI_DOMAIN, {
          roomName,
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
  }, [displayName, onError, roomName])

  return (
    <div
      ref={containerRef}
      className="w-full overflow-hidden rounded-lg bg-slate-950"
      style={{ height: 'min(62dvh, 580px)', minHeight: '320px' }}
      aria-label="Jitsi class meeting"
    />
  )
}

export function JoinClassDialog({ session, onClose }: { session: ClassSession; onClose: () => void }) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [joinUrl, setJoinUrl] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [embedError, setEmbedError] = useState('')
  const roomName = jitsiRoomName(joinUrl)
  const isJitsi = Boolean(roomName)
  const providerName = isJitsi
    ? 'Jitsi Meet'
    : session.meeting_provider === 'zoom'
      ? 'Zoom'
      : session.meeting_provider === 'jitsi'
        ? 'Jitsi Meet'
        : 'Google Meet'

  useEffect(() => {
    let active = true
    setEmbedError('')
    async function prepareMeeting() {
      try {
        const result = await api<MeetingReply>(`/teacher/sessions/${session.id}/meeting`, { method: 'POST' })
        if (!active) return
        setStatus(result.status)
        if (!result.joinUrl) {
          setError(result.error ?? 'The meeting link is not ready yet. Please try again shortly.')
          return
        }
        setJoinUrl(result.joinUrl)
      } catch (err) {
        if (active) setError(getErrorMessage(err))
      } finally {
        if (active) setLoading(false)
      }
    }
    void prepareMeeting()
    return () => { active = false }
  }, [session.id])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <section className={`w-full ${isJitsi ? 'max-w-[1500px] max-h-[calc(100vh-2rem)] overflow-y-auto' : 'max-w-md'} rounded-2xl border border-slate-200 bg-white p-6 shadow-xl`} role="dialog" aria-modal="true" aria-labelledby="join-class-title">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-blue-600">Live class</p>
            <h2 id="join-class-title" className="mt-1 text-xl font-bold text-slate-900">Join your class</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close join class dialog" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <p className="mt-2 text-sm text-slate-500">
          {session.student_name ?? 'Student'}
          {session.starts_at ? ` · ${new Date(session.starts_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}
        </p>

        <div className={`mt-5 ${isJitsi ? '' : 'rounded-xl border border-slate-200 bg-slate-50 p-4'}`}>
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-4 text-sm text-slate-500">
              <span className="spinner" />
              Preparing your meeting…
            </div>
          ) : error ? (
            <div className="space-y-2">
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
              <p className="text-xs text-slate-500">You can close this window and try again when the meeting is ready.</p>
            </div>
          ) : isJitsi ? (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(300px,2fr)]">
              <SharedWhiteboard sessionId={session.id} />
              <div className="min-w-0 space-y-3">
                {embedError ? (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {embedError}{' '}
                    <a href={joinUrl ?? '#'} target="_blank" rel="noopener noreferrer" className="underline">Open Jitsi in a new tab</a>
                  </p>
                ) : (
                  <JitsiMeetingFrame roomName={roomName} displayName={user?.name} onError={setEmbedError} />
                )}
                {!embedError && (
                  <p className="text-xs text-slate-600">
                    To show the board to Jitsi attendees,{' '}
                    <a
                      href={`/classroom/whiteboard/${encodeURIComponent(session.id)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-blue-700 underline"
                    >
                      open a board-only tab
                    </a>
                    , then use Jitsi’s Share screen control to select that tab.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4 text-center">
              <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-left">
                <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-blue-600 text-white">
                  <Video size={18} />
                </span>
                <span>
                  <strong className="block text-sm text-slate-900">{providerName} meeting ready</strong>
                  <span className="block text-xs text-slate-500">You are still inside the teacher portal.</span>
                </span>
              </div>
              <a
                href={joinUrl ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                <ExternalLink size={15} />
                Open {providerName} meeting
              </a>
              <p className="text-xs text-slate-500">{providerName} opens in a new tab. Keep this portal open to return to your session.</p>
            </div>
          )}
        </div>

        {!loading && (
          <button type="button" onClick={onClose} className="mt-5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Close
          </button>
        )}
        {status === 'creating' && !error && !loading && (
          <p className="mt-3 text-center text-xs text-slate-500">Meeting creation is still in progress. Close and reopen this dialog shortly.</p>
        )}
      </section>
    </div>
  )
}
