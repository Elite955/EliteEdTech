import { useEffect, useState } from 'react'
import { ExternalLink, Video, X } from 'lucide-react'
import { api, getErrorMessage } from '../lib/api'
import type { ClassSession } from '../lib/types'

type MeetingReply = {
  status: string
  joinUrl: string | null
  meetingId: string | null
  error: string | null
}

export function JoinClassDialog({ session, onClose }: { session: ClassSession; onClose: () => void }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [joinUrl, setJoinUrl] = useState<string | null>(null)
  const [status, setStatus] = useState('')

  useEffect(() => {
    let active = true
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
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="join-class-title">
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

        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
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
          ) : (
            <div className="space-y-4 text-center">
              <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-left">
                <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-blue-600 text-white">
                  <Video size={18} />
                </span>
                <span>
                  <strong className="block text-sm text-slate-900">Zoom meeting ready</strong>
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
                Open Zoom meeting
              </a>
              <p className="text-xs text-slate-500">Zoom opens in a new tab. Keep this portal open to return to your session.</p>
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
