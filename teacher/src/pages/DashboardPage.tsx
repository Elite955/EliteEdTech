import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Calendar,
  ClipboardList,
  Video,
  Star,
  DollarSign,
  Clock,
  Users,
} from 'lucide-react'
import { api, getErrorMessage } from '../lib/api'
import type { Booking, ClassSession } from '../lib/types'
import { useAuth } from '../auth/useAuth'

interface DashboardStats {
  totalBookings: number
  pendingBookings: number
  upcomingSessions: number
  completedSessions: number
  totalEarnings: number
  averageRating: number
}

export function DashboardPage() {
  const { user } = useAuth()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [pendingBookings, setPendingBookings] = useState<Booking[]>([])
  const [upcomingSessions, setUpcomingSessions] = useState<ClassSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const [statsData, bookingsData, sessionsData] = await Promise.all([
          api<{ stats: DashboardStats }>('/teacher/dashboard/stats'),
          api<{ items: Booking[] }>('/teacher/bookings?status=pending&limit=5'),
          api<{ items: ClassSession[] }>('/teacher/sessions?status=scheduled&limit=5'),
        ])
        setStats(statsData.stats)
        setPendingBookings(bookingsData.items)
        setUpcomingSessions(sessionsData.items)
      } catch (err) {
        setError(getErrorMessage(err))
      } finally {
        setLoading(false)
      }
    }
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
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="spinner" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-700 px-6 py-4 rounded-xl border border-red-200">
        {error}
      </div>
    )
  }

  const statCards = [
    { label: 'Pending Requests', value: stats?.pendingBookings ?? 0, icon: ClipboardList, color: 'text-amber-600 bg-amber-50' },
    { label: 'Upcoming Sessions', value: stats?.upcomingSessions ?? 0, icon: Calendar, color: 'text-blue-600 bg-blue-50' },
    { label: 'Completed Classes', value: stats?.completedSessions ?? 0, icon: Video, color: 'text-green-600 bg-green-50' },
    { label: 'Total Earnings', value: `₹${(stats?.totalEarnings ?? 0).toLocaleString('en-IN')}`, icon: DollarSign, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Total Bookings', value: stats?.totalBookings ?? 0, icon: Users, color: 'text-indigo-600 bg-indigo-50' },
    { label: 'Avg. Rating', value: stats?.averageRating ? stats.averageRating.toFixed(1) : '—', icon: Star, color: 'text-yellow-600 bg-yellow-50' },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">
          Welcome back, {user?.name?.split(' ')[0] ?? 'Teacher'} 👋
        </h2>
        <p className="text-slate-500 mt-1">Here's an overview of your teaching activity.</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4"
          >
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
              <Icon size={22} />
            </div>
            <div>
              <p className="text-sm text-slate-500">{label}</p>
              <p className="text-xl font-bold text-slate-900">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Pending bookings */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            <ClipboardList size={18} className="text-amber-500" />
            Pending Requests
          </h3>
          <Link to="/bookings" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
            View All →
          </Link>
        </div>
        {pendingBookings.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-slate-400">No pending booking requests.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {pendingBookings.map(b => (
              <div key={b.id} className="px-6 py-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">{b.student_name}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(b.starts_at).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                    {' · '}
                    {new Date(b.starts_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    –
                    {new Date(b.ends_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <span className="text-sm font-semibold text-slate-900">₹{b.amount}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upcoming sessions */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            <Clock size={18} className="text-blue-500" />
            Upcoming Sessions
          </h3>
          <Link to="/sessions" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
            View All →
          </Link>
        </div>
        {upcomingSessions.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-slate-400">No upcoming sessions.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {upcomingSessions.map(s => (
              <div key={s.id} className="px-6 py-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">{s.student_name ?? 'Student'}</p>
                  <p className="text-xs text-slate-500">
                    {s.starts_at && new Date(s.starts_at).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                    {' · '}
                    {s.meeting_provider === 'zoom' ? '📹 Zoom' : '📹 Google Meet'}
                  </p>
                </div>
                <Link
                  to={`/sessions/${s.id}`}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  Open →
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
