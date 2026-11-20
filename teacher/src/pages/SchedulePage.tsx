import { useEffect, useState } from 'react'
import { Calendar as CalendarIcon, Clock } from 'lucide-react'
import { api, getErrorMessage } from '../lib/api'
import type { Booking, ClassSession } from '../lib/types'

interface ScheduleItem {
  type: 'booking' | 'session'
  id: string
  title: string
  starts_at: string
  ends_at: string
  status: string
}

export function SchedulePage() {
  const [items, setItems] = useState<ScheduleItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [weekOffset, setWeekOffset] = useState(0)

  useEffect(() => {
    async function load() {
      try {
        const startOfWeek = new Date()
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay() + weekOffset * 7)
        startOfWeek.setHours(0, 0, 0, 0)
        const endOfWeek = new Date(startOfWeek)
        endOfWeek.setDate(endOfWeek.getDate() + 7)

        const [bookingsData, sessionsData] = await Promise.all([
          api<{ items: Booking[] }>(`/teacher/bookings?from=${startOfWeek.toISOString()}&to=${endOfWeek.toISOString()}&status=paid,approved`),
          api<{ items: ClassSession[] }>(`/teacher/sessions?from=${startOfWeek.toISOString()}&to=${endOfWeek.toISOString()}`),
        ])

        const schedule: ScheduleItem[] = [
          ...bookingsData.items.map(b => ({
            type: 'booking' as const,
            id: b.id,
            title: `${b.student_name} (Booking)`,
            starts_at: b.starts_at,
            ends_at: b.ends_at,
            status: b.status,
          })),
          ...sessionsData.items.map(s => ({
            type: 'session' as const,
            id: s.id,
            title: `${s.student_name ?? 'Session'} (Class)`,
            starts_at: s.starts_at ?? s.created_at,
            ends_at: s.ends_at ?? s.created_at,
            status: s.status,
          })),
        ].sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())

        setItems(schedule)
      } catch (err) {
        setError(getErrorMessage(err))
      } finally {
        setLoading(false)
      }
    }
    setLoading(true)
    load()
  }, [weekOffset])

  const getWeekLabel = () => {
    const start = new Date()
    start.setDate(start.getDate() - start.getDay() + weekOffset * 7)
    const end = new Date(start)
    end.setDate(end.getDate() + 6)
    const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
    return `${start.toLocaleDateString('en-IN', opts)} — ${end.toLocaleDateString('en-IN', opts)}`
  }

  // Group by day
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - d.getDay() + weekOffset * 7 + i)
    d.setHours(0, 0, 0, 0)
    return d
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Schedule</h2>
          <p className="text-slate-500 mt-1">Your weekly teaching calendar.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekOffset(w => w - 1)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50 transition-colors"
          >
            ← Prev
          </button>
          <button
            onClick={() => setWeekOffset(0)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50 transition-colors font-medium"
          >
            Today
          </button>
          <button
            onClick={() => setWeekOffset(w => w + 1)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50 transition-colors"
          >
            Next →
          </button>
        </div>
      </div>

      <p className="text-sm font-medium text-slate-600 flex items-center gap-2">
        <CalendarIcon size={16} className="text-blue-500" />
        {getWeekLabel()}
      </p>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-200">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <span className="spinner" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-7 gap-4">
          {days.map(day => {
            const dayStr = day.toDateString()
            const dayItems = items.filter(item => new Date(item.starts_at).toDateString() === dayStr)
            const isToday = new Date().toDateString() === dayStr

            return (
              <div
                key={dayStr}
                className={`bg-white rounded-xl border ${isToday ? 'border-blue-300 ring-1 ring-blue-100' : 'border-slate-200'} min-h-[160px]`}
              >
                <div className={`px-4 py-3 border-b ${isToday ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200'} rounded-t-xl`}>
                  <p className={`text-xs font-semibold ${isToday ? 'text-blue-700' : 'text-slate-500'}`}>
                    {day.toLocaleDateString('en-IN', { weekday: 'short' })}
                  </p>
                  <p className={`text-lg font-bold ${isToday ? 'text-blue-900' : 'text-slate-900'}`}>
                    {day.getDate()}
                  </p>
                </div>
                <div className="p-3 space-y-2">
                  {dayItems.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-4">Free</p>
                  )}
                  {dayItems.map(item => (
                    <div
                      key={`${item.type}-${item.id}`}
                      className={`rounded-lg px-3 py-2 text-xs border ${
                        item.type === 'session'
                          ? 'bg-green-50 border-green-200 text-green-800'
                          : 'bg-blue-50 border-blue-200 text-blue-800'
                      }`}
                    >
                      <p className="font-medium truncate">{item.title}</p>
                      <p className="flex items-center gap-1 mt-0.5 opacity-75">
                        <Clock size={10} />
                        {new Date(item.starts_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
