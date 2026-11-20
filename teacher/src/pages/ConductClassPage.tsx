import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft,
  Video,
  ExternalLink,
  Play,
  Square,
  Users,
  Shield,
  Clock,
} from 'lucide-react'
import { api, getErrorMessage } from '../lib/api'
import type { ClassSession, AttendanceRecord } from '../lib/types'
import { JoinClassDialog } from '../components/JoinClassDialog'

export function ConductClassPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const [session, setSession] = useState<ClassSession | null>(null)
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [error, setError] = useState('')
  const [joining, setJoining] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await api<{ session: ClassSession; attendance: AttendanceRecord[] }>(
        `/teacher/sessions/${sessionId}`
      )
      setSession(data.session)
      setAttendance(data.attendance)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => { load() }, [load])

  const handleStartSession = async () => {
    setActing(true)
    setError('')
    try {
      await api(`/teacher/sessions/${sessionId}/start`, { method: 'POST' })
      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setActing(false)
    }
  }

  const handleEndSession = async () => {
    setActing(true)
    setError('')
    try {
      await api(`/teacher/sessions/${sessionId}/end`, { method: 'POST' })
      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setActing(false)
    }
  }

  const handleToggleConsent = async () => {
    setActing(true)
    setError('')
    try {
      await api(`/teacher/sessions/${sessionId}/recording-consent`, {
        method: 'PATCH',
        body: JSON.stringify({ consent: !session?.recording_consent }),
      })
      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setActing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="spinner" />
      </div>
    )
  }

  if (!session) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-500">Session not found.</p>
        <Link to="/sessions" className="text-blue-600 hover:text-blue-700 text-sm mt-2 inline-block">
          ← Back to Sessions
        </Link>
      </div>
    )
  }

  const duration = session.started_at && session.ended_at
    ? Math.round((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 60000)
    : null

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link to="/sessions" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft size={16} />
        Back to Sessions
      </Link>

      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Video size={24} className="text-blue-500" />
            Conduct Class
          </h2>
          <p className="text-slate-500 mt-1">
            {session.student_name ?? 'Student'} · {session.meeting_provider === 'zoom' ? 'Zoom' : 'Google Meet'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {session.status === 'scheduled' && (
            <button
              onClick={handleStartSession}
              disabled={acting}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              <Play size={16} />
              Start Session
            </button>
          )}
          {session.status === 'ongoing' && (
            <button
              onClick={handleEndSession}
              disabled={acting}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              <Square size={16} />
              End Session
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-200">{error}</div>
      )}

      {/* Session details */}
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-200">
        {/* Meeting link */}
        <div className="p-6">
          <h3 className="font-semibold text-slate-900 mb-3">Meeting Link</h3>
          <div className="flex flex-wrap items-center gap-3">
            {['scheduled', 'ongoing'].includes(session.status) && (
              <button
                type="button"
                onClick={() => setJoining(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                <Video size={16} />
                Join class here
              </button>
            )}
            {session.meeting_url && (
              <a
                href={session.meeting_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-100 border border-blue-200 transition-colors"
              >
                <ExternalLink size={16} />
                Open Zoom directly
              </a>
            )}
            {!session.meeting_url && (
              <p className="text-sm text-slate-400">
                Status: <strong>{session.meeting_creation_status}</strong>
              </p>
            )}
          </div>
        </div>

        {/* Session timing */}
        <div className="p-6">
          <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <Clock size={16} className="text-slate-400" />
            Session Timing
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-slate-500">Scheduled</p>
              <p className="font-medium text-slate-900">
                {session.starts_at ? new Date(session.starts_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Status</p>
              <p className="font-medium text-slate-900 capitalize">{session.status}</p>
            </div>
            <div>
              <p className="text-slate-500">Started</p>
              <p className="font-medium text-slate-900">
                {session.started_at ? new Date(session.started_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Duration</p>
              <p className="font-medium text-slate-900">{duration ? `${duration} min` : '—'}</p>
            </div>
          </div>
        </div>

        {/* Recording consent */}
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <Shield size={16} className="text-slate-400" />
                Recording Consent
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                {session.recording_consent
                  ? 'Recording is enabled with consent.'
                  : 'Recording is currently disabled.'}
              </p>
            </div>
            <button
              onClick={handleToggleConsent}
              disabled={acting || session.status === 'completed'}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                session.recording_consent ? 'bg-green-500' : 'bg-slate-300'
              } ${session.status === 'completed' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  session.recording_consent ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          {session.recording_url && (
            <div className="mt-3">
              <a
                href={session.recording_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                📹 View Recording →
              </a>
            </div>
          )}
        </div>

        {/* Attendance */}
        <div className="p-6">
          <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <Users size={16} className="text-slate-400" />
            Attendance Log
          </h3>
          {attendance.length === 0 ? (
            <p className="text-sm text-slate-400">No attendance records yet.</p>
          ) : (
            <div className="space-y-2">
              {attendance.map(a => (
                <div key={a.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-3">
                  <p className="text-sm font-medium text-slate-900">{a.user_name}</p>
                  <div className="text-xs text-slate-500">
                    {a.joined_at && (
                      <span>Joined: {new Date(a.joined_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                    )}
                    {a.left_at && (
                      <span className="ml-3">Left: {new Date(a.left_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {joining && <JoinClassDialog session={session} onClose={() => setJoining(false)} />}
    </div>
  )
}
