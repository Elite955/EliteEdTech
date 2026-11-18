import { useCallback, useEffect, useState } from 'react'
import {
  CheckCircle,
  XCircle,
  Clock,
  Filter,
} from 'lucide-react'
import { api, getErrorMessage } from '../lib/api'
import { playUiSound } from '../lib/sound'
import type { Booking } from '../lib/types'
import { ApprovalCelebration } from '../components/ApprovalCelebration'

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected' | 'paid' | 'completed' | 'cancelled'

const statusStyles: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-blue-50 text-blue-700 border-blue-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  paid: 'bg-green-50 text-green-700 border-green-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-slate-50 text-slate-500 border-slate-200',
}

export function BookingQueuePage() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [celebration, setCelebration] = useState<{ id: string; studentName: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const query = filter === 'all' ? '' : `?status=${filter}`
      const data = await api<{ items: Booking[] }>(`/teacher/bookings${query}`)
      setBookings(data.items)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    load()
    const interval = window.setInterval(load, 5000)
    const refresh = () => load()
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [load])

  useEffect(() => {
    if (!celebration) return
    const timer = window.setTimeout(() => setCelebration(null), 3200)
    return () => window.clearTimeout(timer)
  }, [celebration])

  const handleAction = async (bookingId: string, action: 'approve' | 'reject') => {
    const studentName = bookings.find((booking) => booking.id === bookingId)?.student_name ?? 'The student'
    setActing(bookingId)
    setError('')
    try {
      await api(`/teacher/bookings/${bookingId}/${action}`, { method: 'POST' })
      if (action === 'approve') {
        playUiSound('success')
        setCelebration({ id: bookingId, studentName })
      } else {
        playUiSound('close')
      }
      await load()
      window.dispatchEvent(new Event('edtech:teacher-bookings-changed'))
    } catch (err) {
      playUiSound('error')
      setError(getErrorMessage(err))
    } finally {
      setActing(null)
    }
  }

  const filters: { label: string; value: StatusFilter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Pending', value: 'pending' },
    { label: 'Approved', value: 'approved' },
    { label: 'Paid', value: 'paid' },
    { label: 'Completed', value: 'completed' },
    { label: 'Rejected', value: 'rejected' },
    { label: 'Cancelled', value: 'cancelled' },
  ]

  return (
    <div className="space-y-6">
      {celebration && <ApprovalCelebration key={celebration.id} studentName={celebration.studentName} />}
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Booking Queue</h2>
        <p className="text-slate-500 mt-1">Review and manage booking requests from students.</p>
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

      {/* Booking list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <span className="spinner" />
        </div>
      ) : bookings.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 px-6 py-16 text-center">
          <Clock size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm text-slate-500">No bookings match this filter.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase px-6 py-3">Student</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase px-6 py-3">Date & Time</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase px-6 py-3">Amount</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase px-6 py-3">Status</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase px-6 py-3">Requested</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bookings.map(b => (
                  <tr key={b.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-slate-900">{b.student_name}</p>
                      <p className="text-xs text-slate-500">{b.student_email}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-slate-900">
                        {new Date(b.starts_at).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                      <p className="text-xs text-slate-500">
                        {new Date(b.starts_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        {' – '}
                        {new Date(b.ends_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-slate-900">₹{b.amount}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium border ${statusStyles[b.status] ?? statusStyles.cancelled}`}>
                        {b.status.charAt(0).toUpperCase() + b.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500">
                      {new Date(b.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {b.status === 'pending' && (
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            onClick={() => handleAction(b.id, 'approve')}
                            disabled={acting === b.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                          >
                            <CheckCircle size={14} />
                            Accept
                          </button>
                          <button
                            onClick={() => handleAction(b.id, 'reject')}
                            disabled={acting === b.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-red-600 border border-red-200 rounded-lg text-xs font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
                          >
                            <XCircle size={14} />
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
