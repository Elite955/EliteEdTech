import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Video, Filter } from 'lucide-react'
import { api, getErrorMessage } from '../lib/api'
import type { ClassSession } from '../lib/types'
import { JoinClassDialog } from '../components/JoinClassDialog'

type SessionFilter = 'all' | 'scheduled' | 'ongoing' | 'completed' | 'cancelled'

const statusStyles: Record<string, string> = {
  scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  ongoing: 'bg-green-50 text-green-700 border-green-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-slate-50 text-slate-500 border-slate-200',
}

export function SessionsPage() {
  const [sessions, setSessions] = useState<ClassSession[]>([])
  const [filter, setFilter] = useState<SessionFilter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [joining, setJoining] = useState<ClassSession | null>(null)

  const load = useCallback(async () => {
    try {
      const query = filter === 'all' ? '' : `?status=${filter}`
      const data = await api<{ items: ClassSession[] }>(`/teacher/sessions${query}`)
      setSessions(data.items)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { load() }, [load])

  const filters: { label: string; value: SessionFilter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Scheduled', value: 'scheduled' },
    { label: 'Ongoing', value: 'ongoing' },
    { label: 'Completed', value: 'completed' },
    { label: 'Cancelled', value: 'cancelled' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">My Sessions</h2>
        <p className="text-slate-500 mt-1">View all your class sessions and their details.</p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-200">{error}</div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter size={16} className="text-slate-400" />
        {filters.map(f => (
          <button
            key={f.value}
            onClick={() => { setFilter(f.value); setLoading(true) }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              filter === f.value
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <span className="spinner" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 px-6 py-16 text-center">
          <Video size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm text-slate-500">No sessions match this filter.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {sessions.map(s => (
            <div key={s.id} className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">{s.student_name ?? 'Student'}</p>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${statusStyles[s.status] ?? ''}`}>
                      {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {s.starts_at && new Date(s.starts_at).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                    {s.starts_at && ' · '}
                    {s.starts_at && new Date(s.starts_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    {s.ends_at && ' – '}
                    {s.ends_at && new Date(s.ends_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <p className="text-xs text-slate-400">
                    Provider: {s.meeting_provider === 'zoom' ? 'Zoom' : 'Google Meet'}
                    {s.recording_consent && ' · 🔴 Recording consented'}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {['scheduled', 'ongoing'].includes(s.status) && (
                    <button
                      type="button"
                      onClick={() => setJoining(s)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors"
                    >
                      <Video size={13} />
                      Join class
                    </button>
                  )}
                  <Link
                    to={`/sessions/${s.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-50 transition-colors"
                  >
                    Details →
                  </Link>
                </div>
              </div>
              {s.recording_url && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <a
                    href={s.recording_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    📹 View Recording →
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {joining && <JoinClassDialog session={joining} onClose={() => setJoining(null)} />}
    </div>
  )
}
