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
  { key: 'totalStudents', label: 'Students', scope: 'All registered', icon: GraduationCap, tone: 'violet', currency: false },
  { key: 'totalTeachers', label: 'Teachers', scope: 'All registered', icon: Users, tone: 'blue', currency: false },
  { key: 'bookings', label: 'Bookings', scope: 'All statuses', icon: BookOpenCheck, tone: 'green', currency: false },
  { key: 'revenue', label: 'Revenue', scope: 'Successful payments', icon: CircleDollarSign, tone: 'amber', currency: true },
] as const

const operationalMetrics = [
  { key: 'administrators', label: 'Admin accounts', icon: Users, tone: 'violet' },
  { key: 'pendingBookings', label: 'Pending bookings', icon: Activity, tone: 'amber' },
  { key: 'completedClasses', label: 'Completed classes', icon: BookOpenCheck, tone: 'green' },
  { key: 'ongoingClasses', label: 'Ongoing classes', icon: Activity, tone: 'blue' },
  { key: 'pendingPayments', label: 'Pending payments', icon: CircleDollarSign, tone: 'blue' },
  { key: 'cancelledClasses', label: 'Cancelled classes', icon: ArrowDownRight, tone: 'rose' },
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
      <div className="page-intro dashboard-intro">
        <div>
          <p className="eyebrow">OVERVIEW</p>
          <h2>Platform overview</h2>
          <p>Key figures and recent activity across the platform.</p>
        </div>
        <div className="dashboard-date"><span>Reporting date</span><strong>{todayLabel}</strong></div>
      </div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="stat-grid">
        {cardDefinitions.map(({ key, label, scope, icon: Icon, tone, currency }) => (
          <article className="stat-card" key={key}>
            <div className="stat-card-top">
              <span className={`stat-icon ${tone}`}><Icon size={19} strokeWidth={1.8} /></span>
              <span className="stat-scope">{scope}</span>
            </div>
            <p>{label}</p>
            <strong>{busy ? '—' : currency ? currencyFormatter.format(Number(stats?.[key] ?? 0)) : numberFormatter.format(Number(stats?.[key] ?? 0))}</strong>
          </article>
        ))}
      </div>
      <section className="operational-section" aria-labelledby="operational-heading">
        <div className="section-heading">
          <div><h3 id="operational-heading">Operational snapshot</h3><p>Current workload and service activity</p></div>
        </div>
        <div className="dashboard-secondary">
          {operationalMetrics.map(({ key, label, icon: Icon, tone }) => (
            <div className="mini-stat" key={key}>
              <span className={`mini-stat-icon ${tone}`}><Icon size={17} strokeWidth={1.8} /></span>
              <div><span>{label}</span><strong>{busy ? '—' : numberFormatter.format(stats?.[key] ?? 0)}</strong></div>
            </div>
          ))}
        </div>
      </section>
      <section className="dashboard-grid">
        <article className="panel trend-panel">
          <div className="panel-heading"><div><h3>Monthly activity</h3><p>Bookings and new student registrations</p></div><span className="panel-period">Last 6 months</span></div>
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
          <div className="panel-heading"><div><h3>Recent admin activity</h3><p>Latest recorded administrative actions</p></div><Link to="/modules/activity_logs" className="panel-link">View log</Link></div>
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
