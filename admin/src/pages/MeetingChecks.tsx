import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  AlertTriangle, CalendarClock, CheckCircle2, Copy, ExternalLink, LoaderCircle,
  Mail, RefreshCw, Video,
} from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import { useSuccessBurst } from '../components/useSuccessBurst'
import { ApiError, api, getErrorMessage } from '../lib/api'
import { playUiSound } from '../lib/sound'

type ConfigurationFlag = { configured: boolean; missingKeys: string[] }

type NotificationSummary = {
  lastStatus: string | null
  sent: number
  failed: number
  queued: number
  unknown: number
}

type MeetingSession = {
  id: string
  bookingId: string
  status: string
  bookingStatus: string
  meetingUrl: string | null
  meetingCreationStatus: string
  startsAt: string
  endsAt: string
  durationMinutes: number
  amount: number
  student: { id: string; name: string; email: string; phone: string | null }
  teacher: { id: string; name: string; email: string; phone: string | null }
  notifications: { email: NotificationSummary }
}

type UnlinkedBooking = {
  id: string
  status: string
  starts_at: string
  ends_at: string
  amount: number
  student: { id: string; name: string }
  teacher: { id: string; name: string }
}

type MeetingChecksData = {
  generatedAt: string
  configuration: {
    meetingProvider: ConfigurationFlag & { id: string; title: string }
    email: ConfigurationFlag
  }
  sessions: MeetingSession[]
  unlinkedPaidBookings: UnlinkedBooking[]
}

type DeliveryItem = { channel: string; status: string; error: string | null }

const IST_ZONE = 'Asia/Kolkata'

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: IST_ZONE }).format(new Date(value))
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: IST_ZONE }).format(new Date(value))
}

function deliveryLabel(summary: NotificationSummary) {
  if (!summary.lastStatus) return 'Not sent'
  if (summary.lastStatus === 'sent') return summary.failed ? 'Partially sent' : 'Sent'
  if (summary.lastStatus === 'failed') return 'Failed'
  if (summary.lastStatus === 'queued') return 'Queued'
  return summary.lastStatus
}

function deliveryClass(summary: NotificationSummary) {
  if (!summary.lastStatus) return 'status-inactive'
  if (summary.lastStatus === 'sent') return summary.failed ? 'status-pending' : 'status-sent'
  if (summary.lastStatus === 'failed') return 'status-failed'
  return 'status-queued'
}

function meetingLabel(session: MeetingSession) {
  if (session.meetingUrl) return 'Link ready'
  if (session.meetingCreationStatus === 'creating') return 'Creating'
  if (session.meetingCreationStatus === 'failed') return 'Creation failed'
  return 'Not created'
}

function meetingClass(session: MeetingSession) {
  if (session.meetingUrl) return 'status-sent'
  if (session.meetingCreationStatus === 'failed') return 'status-failed'
  if (session.meetingCreationStatus === 'creating') return 'status-queued'
  return 'status-inactive'
}

function ConfigurationCard({ title, icon, state, description }: {
  title: string
  icon: ReactNode
  state: ConfigurationFlag
  description: string
}) {
  return (
    <article className="panel meeting-config-card">
      <div className="meeting-config-top">
        <span className="meeting-config-icon">{icon}</span>
        <span className={`status-pill ${state.configured ? 'status-sent' : 'status-pending'}`}>
          {state.configured ? 'Ready' : 'Missing setup'}
        </span>
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {state.configured ? (
        <span className="meeting-config-note"><CheckCircle2 size={13} /> Configured</span>
      ) : (
        <div className="meeting-config-note missing">
          <AlertTriangle size={13} />
          <span>Add {state.missingKeys.join(', ') || 'the provider credentials'} to the backend environment.</span>
        </div>
      )}
    </article>
  )
}

export function MeetingChecks() {
  const { can } = useAuth()
  const { celebrate, burst } = useSuccessBurst()
  const canManage = can('live_classes', 'manage')
  const [data, setData] = useState<MeetingChecksData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true)
    else setRefreshing(true)
    setError('')
    try {
      setData(await api<MeetingChecksData>('/admin/meeting-checks'))
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    async function loadChecks() {
      try {
        setData(await api<MeetingChecksData>('/admin/meeting-checks', { signal: controller.signal }))
      } catch (requestError) {
        if (!controller.signal.aborted) setError(getErrorMessage(requestError))
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void loadChecks()
    return () => controller.abort()
  }, [])

  async function runAction(sessionId: string, action: 'create-meeting' | 'send-join-details') {
    setBusy(`${action}:${sessionId}`)
    setError('')
    setNotice('')
    try {
      if (action === 'create-meeting') {
        await api(`/admin/live-classes/${sessionId}/create-meeting`, { method: 'POST' })
        setNotice('The meeting link is ready.')
        celebrate('Meeting link ready')
      } else {
        const result = await api<{ delivery?: DeliveryItem[] }>(`/admin/live-classes/${sessionId}/send-join-details`, { method: 'POST' })
        const delivery = result.delivery ?? []
        const sent = delivery.filter((item) => item.status === 'sent').length
        const failed = delivery.filter((item) => item.status === 'failed').length
        const skipped = delivery.filter((item) => item.status !== 'sent' && item.status !== 'failed').length
        if (!delivery.length) setNotice('Join details were processed.')
        else setNotice(`Join details processed: ${sent} sent, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}.`)
        if (failed) {
          playUiSound('error')
          setError('Some messages failed. The delivery column shows the latest attempt per channel.')
        } else {
          celebrate('Join details processed', `${sent} sent${skipped ? `, ${skipped} skipped` : ''}.`)
        }
      }
      await load(false)
    } catch (requestError) {
      playUiSound('error')
      const details = requestError instanceof ApiError ? requestError.data as { missingKeys?: string[]; configuration?: MeetingChecksData['configuration'] } | null : null
      const missing = details?.missingKeys ?? []
      setError(`${getErrorMessage(requestError)}${missing.length ? ` Missing: ${missing.join(', ')}.` : ''}`)
      if (action === 'send-join-details') await load(false)
    } finally {
      setBusy('')
    }
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setNotice('Meeting link copied.')
      setError('')
      celebrate('Link copied')
    } catch {
      playUiSound('error')
      setError('Could not copy the link. Open it and copy from the address bar.')
    }
  }

  const missingConfiguration = data
    ? [
      !data.configuration.meetingProvider.configured ? data.configuration.meetingProvider.title : null,
      !data.configuration.email.configured ? 'email' : null,
    ].filter(Boolean)
    : []

  return (
    <div className="meeting-checks-page">
      {burst}
      <div className="page-intro">
        <div>
          <p className="eyebrow">LIVE CLASSES</p>
          <h2>Meeting checks</h2>
          <p>Confirm every paid one-to-one has a meeting link, then send the details to the student and teacher.</p>
        </div>
        <div className="intro-actions">
          <button className="secondary-button" onClick={() => void load(false)} disabled={loading || refreshing}>
            <RefreshCw size={15} /> {refreshing ? 'Refreshing' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <div role="alert" className="alert alert-error">{error}</div>}
      {notice && <div role="status" className="alert alert-success">{notice}</div>}
      {missingConfiguration.length > 0 && (
        <div className="alert alert-info">
          Setup still needs {missingConfiguration.join(', ')}. The selected meeting provider is required to create new links; email setup is required to send messages. Existing meeting links can still be sent.
        </div>
      )}

      {data && (
        <div className="meeting-config-grid">
          <ConfigurationCard
            title={data.configuration.meetingProvider.title}
            icon={<Video size={17} />}
            state={data.configuration.meetingProvider}
            description={data.configuration.meetingProvider.id === 'jitsi'
              ? 'Generates a unique room on public Jitsi. Anyone with the link may join; the teacher should open it first and may need to authenticate.'
              : 'Creates the one-to-one meeting link for each scheduled class.'}
          />
          <ConfigurationCard
            title="Email"
            icon={<Mail size={17} />}
            state={data.configuration.email}
            description="Sends the session date, time, and join link to both people."
          />
        </div>
      )}

      <div className="meeting-help panel">
        <CalendarClock size={18} />
        <div>
          <strong>How to check a booking</strong>
          <p>Create the meeting link, send the join details, then ask the student and teacher to confirm they received the email. It carries the same link.</p>
        </div>
      </div>

      <section className="panel data-panel meeting-panel">
        <div className="panel-heading">
          <div>
            <h3>Upcoming paid sessions</h3>
            <p>Two days back through the next 90 days. Newest delivery attempt shown per channel.</p>
          </div>
          <span className="permission-count">{data ? `${data.sessions.length} session${data.sessions.length === 1 ? '' : 's'}` : 'Loading'}</span>
        </div>
        {loading ? (
          <div className="table-empty"><LoaderCircle size={24} className="spin" /><strong>Loading meeting checks</strong><span>Reading sessions and delivery records.</span></div>
        ) : (
          <div className="table-scroll">
            <table className="meeting-table">
              <thead>
                <tr>
                  <th>When</th><th>Student</th><th>Teacher</th><th>Meeting</th><th>Delivery</th><th className="align-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(data?.sessions ?? []).map((session) => (
                  <tr key={session.id}>
                    <td>
                      <strong className="table-primary">{formatDate(session.startsAt)}</strong>
                      <small className="table-secondary">{formatTime(session.startsAt)} - {formatTime(session.endsAt)} IST · {session.durationMinutes} min</small>
                    </td>
                    <td>
                      <strong className="table-primary">{session.student.name}</strong>
                      <small className="table-secondary">{session.student.email}</small>
                      <small className="table-secondary">{session.student.phone || 'No phone'}</small>
                    </td>
                    <td>
                      <strong className="table-primary">{session.teacher.name}</strong>
                      <small className="table-secondary">{session.teacher.email}</small>
                      <small className="table-secondary">{session.teacher.phone || 'No phone'}</small>
                    </td>
                    <td>
                      <span className={`status-pill ${meetingClass(session)}`}>{meetingLabel(session)}</span>
                      {session.meetingUrl && (
                        <div className="meeting-link-row">
                          <a className="table-action" href={session.meetingUrl} target="_blank" rel="noreferrer"><ExternalLink size={12} /> Open</a>
                          <button className="table-action" onClick={() => void copyLink(session.meetingUrl!)}><Copy size={12} /> Copy</button>
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="delivery-lines">
                        <span><Mail size={12} /> Email <em className={`status-pill ${deliveryClass(session.notifications.email)}`}>{deliveryLabel(session.notifications.email)}</em></span>
                      </div>
                    </td>
                    <td className="align-right">
                      <div className="row-actions">
                        {canManage && !session.meetingUrl && (
                          <button
                            className="table-action"
                            disabled={busy !== '' || ['cancelled', 'rejected'].includes(session.bookingStatus) || ['completed', 'cancelled'].includes(session.status)}
                            onClick={() => void runAction(session.id, 'create-meeting')}
                          >
                            {busy === `create-meeting:${session.id}` ? 'Creating' : 'Create link'}
                          </button>
                        )}
                        {canManage && (
                          <button
                            className="table-action"
                            disabled={busy !== '' || ['cancelled', 'rejected'].includes(session.bookingStatus) || ['cancelled'].includes(session.status)}
                            onClick={() => void runAction(session.id, 'send-join-details')}
                          >
                            {busy === `send-join-details:${session.id}` ? 'Sending' : session.meetingUrl ? 'Resend details' : 'Create and send'}
                          </button>
                        )}
                        {!canManage && <span className="table-secondary">View only</span>}
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && !(data?.sessions.length) && (
                  <tr><td colSpan={6}><div className="table-empty"><CalendarClock size={26} /><strong>No upcoming paid sessions</strong><span>Paid bookings with a scheduled class appear here.</span></div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {!!data?.unlinkedPaidBookings.length && (
        <section className="panel data-panel meeting-panel">
          <div className="panel-heading">
            <div>
              <h3>Paid bookings without a class session</h3>
              <p>These bookings cannot receive meeting details until a class session exists.</p>
            </div>
            <span className="permission-count">{data.unlinkedPaidBookings.length}</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead><tr><th>When</th><th>Student</th><th>Teacher</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>
                {data.unlinkedPaidBookings.map((booking) => (
                  <tr key={booking.id}>
                    <td><strong className="table-primary">{formatDate(booking.starts_at)}</strong><small className="table-secondary">{formatTime(booking.starts_at)} IST</small></td>
                    <td>{booking.student.name}</td>
                    <td>{booking.teacher.name}</td>
                    <td>Rs. {booking.amount.toLocaleString('en-IN')}</td>
                    <td><span className={`status-pill status-${booking.status}`}>{booking.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {data && (
        <p className="meeting-generated">Last checked {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: IST_ZONE }).format(new Date(data.generatedAt))} IST</p>
      )}
    </div>
  )
}
