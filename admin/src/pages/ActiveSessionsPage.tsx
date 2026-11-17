import { useEffect, useState } from 'react'
import { GraduationCap, Monitor, RefreshCw, ShieldCheck, UserCog, Users } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import { api, getErrorMessage } from '../lib/api'

type ActiveSession = {
  id: string
  name: string
  email: string
  account_type: 'admin' | 'student' | 'teacher'
  role_name: string
  created_at: string
  last_seen_at: string
  expires_at: string
  ip_address: string | null
  user_agent: string | null
  is_current: boolean
}

const dateFormatter = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' })

function describeDevice(userAgent: string | null): string {
  if (!userAgent) return 'Device not reported'

  const browser = userAgent.includes('Edg/')
    ? 'Edge'
    : userAgent.includes('OPR/')
      ? 'Opera'
      : userAgent.includes('Firefox/')
        ? 'Firefox'
        : userAgent.includes('Chrome/')
          ? 'Chrome'
          : userAgent.includes('Safari/')
            ? 'Safari'
            : 'Other browser'
  const platform = /iPhone|iPad/.test(userAgent)
    ? 'iOS'
    : userAgent.includes('Android')
      ? 'Android'
      : userAgent.includes('Windows')
        ? 'Windows'
        : /Macintosh|Mac OS X/.test(userAgent)
          ? 'macOS'
          : userAgent.includes('CrOS')
            ? 'ChromeOS'
            : userAgent.includes('Linux')
              ? 'Linux'
              : 'Unknown device'

  return `${browser} on ${platform}`
}

function accountIcon(accountType: ActiveSession['account_type']) {
  if (accountType === 'student') return GraduationCap
  if (accountType === 'teacher') return Users
  return UserCog
}

export function ActiveSessionsPage() {
  const { user } = useAuth()
  const isSuperAdmin = user?.roleCode === 'super_admin'
  const [items, setItems] = useState<ActiveSession[]>([])
  const [loading, setLoading] = useState(isSuperAdmin)
  const [revokingId, setRevokingId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!isSuperAdmin) return
    const controller = new AbortController()
    async function fetchSessions() {
      try {
        const result = await api<{ items: ActiveSession[] }>('/admin/security/sessions/active', { signal: controller.signal })
        if (!controller.signal.aborted) {
          setItems(result.items)
          setError('')
        }
      } catch (requestError) {
        if (!controller.signal.aborted) setError(getErrorMessage(requestError))
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void fetchSessions()
    return () => controller.abort()
  }, [isSuperAdmin, refreshKey])

  function refreshSessions() {
    setLoading(true)
    setError('')
    setRefreshKey((current) => current + 1)
  }

  async function revokeSession(session: ActiveSession) {
    if (session.is_current || revokingId) return
    const confirmed = window.confirm(`Sign out ${session.name} from this device? They will need to sign in again.`)
    if (!confirmed) return
    setRevokingId(session.id)
    setError('')
    setNotice('')
    try {
      const result = await api<{ message: string }>(`/admin/security/sessions/${session.id}/revoke`, { method: 'POST' })
      setNotice(result.message)
      refreshSessions()
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setRevokingId('')
    }
  }

  if (!isSuperAdmin) {
    return <div className="alert alert-error" role="alert">Only Super Admins can view active session details.</div>
  }

  return (
    <div className="sessions-page">
      <div className="page-intro">
        <div>
          <p className="eyebrow">SECURITY</p>
          <h2>Active sessions</h2>
          <p>Review signed-in accounts and end sessions that look unfamiliar.</p>
        </div>
        <button className="secondary-button" onClick={refreshSessions} disabled={loading}>
          <RefreshCw size={15} /> {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      <div className="session-privacy-note">
        <ShieldCheck size={17} />
        <span>Only unexpired, unrevoked sessions are shown; an account may be idle while its session remains valid. IP and browser details are visible only to Super Admins. Viewing and revoking is audited.</span>
      </div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {notice && <div className="alert alert-success" role="status">{notice}</div>}
      <section className="panel data-panel">
        <div className="table-toolbar">
          <div className="toolbar-note"><Monitor size={17} /> Signed-in accounts</div>
          <span className="result-count">{loading ? 'Loading…' : `${items.length} active ${items.length === 1 ? 'session' : 'sessions'}`}</span>
        </div>
        <div className="table-scroll"><table className="session-table">
          <thead><tr><th>Account</th><th>Role</th><th>Signed in</th><th>Last API activity</th><th>IP address</th><th>Browser & device</th><th>Expires</th><th className="align-right">Session</th></tr></thead>
          <tbody>
            {items.map((session) => {
              const Icon = accountIcon(session.account_type)
              return (
                <tr key={session.id}>
                  <td><div className="person-cell"><span className={`person-avatar ${session.account_type}`}><Icon size={16} /></span><span><strong>{session.name}{session.is_current ? ' (you)' : ''}</strong><small>{session.email}</small></span></div></td>
                  <td><span className="role-tag">{session.role_name}</span></td>
                  <td>{dateFormatter.format(new Date(session.created_at))}</td>
                  <td>{dateFormatter.format(new Date(session.last_seen_at))}</td>
                  <td><code className="session-ip">{session.ip_address ?? 'Not reported'}</code></td>
                  <td>
                    <div className="session-device">
                      <strong>{describeDevice(session.user_agent)}</strong>
                      {session.user_agent && <details><summary>Device details</summary><code>{session.user_agent}</code></details>}
                    </div>
                  </td>
                  <td>{dateFormatter.format(new Date(session.expires_at))}</td>
                  <td className="align-right">
                    {session.is_current
                      ? <span className="status-pill status-active">This device</span>
                      : <button className="table-action danger-action" disabled={Boolean(revokingId)} onClick={() => void revokeSession(session)}>{revokingId === session.id ? 'Revoking…' : 'Revoke'}</button>}
                  </td>
                </tr>
              )
            })}
            {!loading && items.length === 0 && <tr><td colSpan={8}><div className="table-empty"><ShieldCheck size={20} /><strong>No active sessions</strong><span>Signed-in accounts will appear here.</span></div></td></tr>}
            {loading && <tr><td colSpan={8}><div className="table-empty"><span className="spinner" /> Loading active sessions…</div></td></tr>}
          </tbody>
        </table></div>
      </section>
    </div>
  )
}
