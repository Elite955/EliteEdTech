import { useEffect, useState } from 'react'
import { Activity, ArrowDownRight, BookOpenCheck, CircleDollarSign, GraduationCap, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api, getErrorMessage } from '../lib/api'

type Overview = {
  stats: {
    students: number
    teachers: number
    administrators: number
    totalStudents: number
    totalTeachers: number
    bookings: number
    pendingBookings: number
    completedClasses: number
    ongoingClasses: number
    cancelledClasses: number
    pendingPayments: number
    revenue: number
  }
  recentActivity: Array<{ id: number; event: string; module: string; created_at: string }>
  trends?: Array<{ month: string; students: number; teachers: number; bookings: number; revenue: number }>
}

const cardDefinitions = [
  { key: 'totalStudents', label: 'Total students', icon: GraduationCap, tone: 'violet', currency: false },
  { key: 'totalTeachers', label: 'Total teachers', icon: Users, tone: 'blue', currency: false },
  { key: 'bookings', label: 'Total bookings', icon: BookOpenCheck, tone: 'green', currency: false },
  { key: 'revenue', label: 'Successful revenue', icon: CircleDollarSign, tone: 'amber', currency: true },
] as const

const numberFormatter = new Intl.NumberFormat('en-IN')
const currencyFormatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

export function Dashboard() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [todayLabel] = useState(() => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date()))

  useEffect(() => {
    let active = true
    api<Overview>('/admin/overview')
      .then((data) => { if (active) setOverview(data) })
      .catch((requestError: unknown) => { if (active) setError(getErrorMessage(requestError)) })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [])

  const stats = overview?.stats
  const trend = overview?.trends ?? []
  const maxActivity = Math.max(1, ...trend.flatMap((item) => [item.bookings, item.students]))

  return (
    <div className="dashboard-page">
      <div className="page-intro">
        <div><p className="eyebrow">PLATFORM OVERVIEW</p><h2>Good day. Here’s your platform at a glance.</h2><p>Monitor activity, service operations, and recent administrative actions.</p></div>
        <span className="date-chip">{todayLabel}</span>
      </div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="stat-grid">
        {cardDefinitions.map(({ key, label, icon: Icon, tone, currency }) => (
          <article className="stat-card" key={key}>
            <div className={`stat-icon ${tone}`}><Icon size={19} /></div>
            <p>{label}</p>
            <strong>{busy ? '—' : currency ? currencyFormatter.format(Number(stats?.[key] ?? 0)) : numberFormatter.format(Number(stats?.[key] ?? 0))}</strong>
            <span className="stat-foot"><span className="stat-period"><Activity size={13} /> All time</span></span>
          </article>
        ))}
      </div>
      <div className="dashboard-secondary">
        <div className="mini-stat"><span className="mini-stat-icon violet"><Users size={17} /></span><div><span>Administrators</span><strong>{busy ? '—' : numberFormatter.format(stats?.administrators ?? 0)}</strong></div></div>
        <div className="mini-stat"><span className="mini-stat-icon violet"><GraduationCap size={17} /></span><div><span>Active students</span><strong>{busy ? '—' : numberFormatter.format(stats?.students ?? 0)}</strong></div></div>
        <div className="mini-stat"><span className="mini-stat-icon blue"><Users size={17} /></span><div><span>Active teachers</span><strong>{busy ? '—' : numberFormatter.format(stats?.teachers ?? 0)}</strong></div></div>
        <div className="mini-stat"><span className="mini-stat-icon amber"><Activity size={17} /></span><div><span>Pending bookings</span><strong>{busy ? '—' : numberFormatter.format(stats?.pendingBookings ?? 0)}</strong></div></div>
        <div className="mini-stat"><span className="mini-stat-icon green"><BookOpenCheck size={17} /></span><div><span>Completed classes</span><strong>{busy ? '—' : numberFormatter.format(stats?.completedClasses ?? 0)}</strong></div></div>
        <div className="mini-stat"><span className="mini-stat-icon green"><BookOpenCheck size={17} /></span><div><span>Ongoing classes</span><strong>{busy ? '—' : numberFormatter.format(stats?.ongoingClasses ?? 0)}</strong></div></div>
        <div className="mini-stat"><span className="mini-stat-icon blue"><CircleDollarSign size={17} /></span><div><span>Payments pending</span><strong>{busy ? '—' : numberFormatter.format(stats?.pendingPayments ?? 0)}</strong></div></div>
        <div className="mini-stat"><span className="mini-stat-icon rose"><ArrowDownRight size={17} /></span><div><span>Classes cancelled</span><strong>{busy ? '—' : numberFormatter.format(stats?.cancelledClasses ?? 0)}</strong></div></div>
      </div>
      <section className="dashboard-grid">
        <article className="panel trend-panel">
          <div className="panel-heading"><div><h3>Platform activity</h3><p>Monthly bookings and completed registrations</p></div><span className="panel-period">Last 6 months</span></div>
          {trend.length ? (
            <div className="activity-chart" role="img" aria-label="Monthly bookings and student registrations">
              {trend.map((item) => (
                <div className="chart-month" key={item.month}>
                  <div className="chart-bars">
                    <span className="chart-bar bookings-bar" title={`${item.bookings} bookings`} style={{ height: `${Math.max(3, item.bookings / maxActivity * 100)}%` }} />
                    <span className="chart-bar students-bar" title={`${item.students} new students`} style={{ height: `${Math.max(3, item.students / maxActivity * 100)}%` }} />
                  </div>
                  <small>{item.month}</small>
                </div>
              ))}
            </div>
          ) : <div className="chart-empty">{busy ? <><span className="spinner" /> Loading platform data…</> : 'Monthly trend data will appear as platform activity is recorded.'}</div>}
          <div className="chart-legend"><span><i className="legend-blue" />Bookings</span><span><i className="legend-green" />Students</span></div>
        </article>
        <article className="panel activity-panel">
          <div className="panel-heading"><div><h3>Recent admin activity</h3><p>Latest logged administrative actions</p></div><Link to="/modules/activity_logs" className="panel-link">View logs</Link></div>
          <div className="activity-list">
            {overview?.recentActivity.map((item) => (
              <div className="activity-row" key={item.id}>
                <span className="activity-dot"><Activity size={14} /></span>
                <div className="activity-text"><strong>{item.event.replaceAll('_', ' ')}</strong><small>{item.module}</small></div>
                <time>{new Intl.DateTimeFormat('en-IN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.created_at))}</time>
              </div>
            ))}
            {!busy && !overview?.recentActivity.length && <div className="empty-inline">No administrative activity recorded yet.</div>}
          </div>
        </article>
      </section>
    </div>
  )
}
