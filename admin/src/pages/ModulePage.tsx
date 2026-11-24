import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { Download, FileText, Pencil, Plus, RefreshCw, RotateCcw, Search, Trash2, Video, X } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import { useSuccessBurst } from '../components/useSuccessBurst'
import { api, apiUrl, getErrorMessage } from '../lib/api'
import { playUiSound } from '../lib/sound'

type ModuleRecord = { id: string; title: string; status: string; created_at: string; data: Record<string, unknown> }
type OfflinePaymentResult = {
  meetingStatus: string
  meetingError?: string | null
  missingKeys?: string[]
  configuration?: {
    email?: { missingKeys?: string[] }
  } | null
  delivery: { channel: string; status: string; error?: string | null }[]
}

const moduleInfo: Record<string, { title: string; description: string; editable?: boolean; statuses?: string[] }> = {
  bookings: { title: 'Bookings', description: 'Review booking requests and record verified bank transfers.', statuses: ['pending', 'approved', 'rejected', 'paid', 'completed', 'cancelled'] },
  live_classes: { title: 'Live classes', description: 'Monitor scheduled and ongoing sessions. Meeting-link creation is limited to development/test mode.', statuses: ['scheduled', 'ongoing', 'completed', 'cancelled'] },
  chat_moderation: { title: 'Global chat moderation', description: 'Review messages that authorized moderators are permitted to access.', statuses: ['visible', 'hidden', 'deleted'] },
  support: { title: 'Support & complaints', description: 'Track user issues, prioritize complaints, and update ticket status.', statuses: ['open', 'in_progress', 'resolved', 'closed'], editable: true },
  transactions: { title: 'Transactions', description: 'Review payment records and record verified bank transfers. Finance Admins can request eligible Razorpay test refunds.' },
  refunds: { title: 'Refunds', description: 'Review full-refund requests sent through explicitly enabled Razorpay test mode.' },
  payouts: { title: 'Teacher payouts', description: 'Payouts are not initiated by the admin console. Connect the approved financial provider before enabling payouts.' },
  revenue_analytics: { title: 'Revenue analytics', description: 'Revenue summaries are based on recorded payment rows; no external payment data is fabricated.' },
  recordings: { title: 'Recordings', description: 'Only recordings with recorded participant consent are listed.' },
  attendance: { title: 'Attendance', description: 'Class attendance records supplied by the session workflow.' },
  reports: { title: 'Reports & analytics', description: 'Download an aggregate admin-operations summary as PDF or XLSX; review report definitions here.', editable: true },
  activity_logs: { title: 'Administrative activity logs', description: 'A chronological audit trail of administrative actions.' },
  notifications: { title: 'Notification centre', description: 'Review email delivery status for booking confirmations and join links.' },
  announcements: { title: 'Announcements', description: 'Create announcement records. Delivery is not sent until a notification provider workflow is configured.', editable: true },
  templates: { title: 'Message templates', description: 'Manage reusable email message template records.', editable: true },
  configuration: { title: 'Platform configuration', description: 'Manage selected non-secret platform settings. Secrets belong in environment configuration, never here.' },
  integrations: { title: 'Integrations', description: 'Provider test-mode readiness is checked from environment configuration; secrets are never displayed.' },
  security: { title: 'Security management', description: 'Review security events and administrative access activity.' },
  backups: { title: 'Backup management', description: 'Backup execution is disabled until a secured storage target and retention policy are approved.' },
  maintenance: { title: 'Maintenance mode', description: 'Manage the maintenance flag. Changes do not affect the public platform until its service consumes this setting.' },
}

const editableModules = new Set(['support', 'reports', 'templates', 'announcements'])

function readableValue(value: unknown): string {
  if (value == null || value === '') return '—'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

export function ModulePage() {
  const { module = '' } = useParams()
  const { can } = useAuth()
  const { celebrate, burst } = useSuccessBurst()
  const info = moduleInfo[module]
  const [items, setItems] = useState<ModuleRecord[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<ModuleRecord | null>(null)
  const [editValue, setEditValue] = useState('')
  const [form, setForm] = useState({ title: '', status: 'active', description: '' })
  const [recordingBooking, setRecordingBooking] = useState<ModuleRecord | null>(null)
  const [transactionReference, setTransactionReference] = useState('')
  const [paymentVerified, setPaymentVerified] = useState(false)
  const [exporting, setExporting] = useState('')
  const canEdit = can(module, ['live_classes', 'chat_moderation', 'configuration', 'maintenance'].includes(module) ? 'manage' : 'edit')
  const canRefund = module === 'transactions' && can('refunds', 'manage')
  const canRecordPayment = module === 'bookings' && can('transactions', 'record_payment')
  const canCreateMeeting = module === 'live_classes' && can('live_classes', 'manage')
  const canRefreshRefund = module === 'refunds' && can('refunds', 'manage')
  const canExportReport = module === 'reports' && can('reports', 'export')
  const canDeleteRecords = ['live_classes', 'recordings'].includes(module) && can(module, 'delete')
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return query ? items.filter((item) => `${item.title} ${item.status} ${JSON.stringify(item.data ?? {})}`.toLowerCase().includes(query)) : items
  }, [items, search])

  const fetchRecords = useCallback((signal?: AbortSignal) => (
    api<{ items: ModuleRecord[] }>(`/admin/modules/${module}`, { signal })
  ), [module])

  const load = useCallback(async (showLoading = true) => {
    if (!info) return
    if (showLoading) {
      setLoading(true)
      setError('')
    }
    try {
      const result = await fetchRecords()
      setItems(result.items)
    } catch (requestError) { setError(getErrorMessage(requestError)) }
    finally { setLoading(false) }
  }, [fetchRecords, info])

  async function recordBankTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!recordingBooking || !paymentVerified) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const result = await api<OfflinePaymentResult>(`/admin/bookings/${recordingBooking.id}/record-bank-transfer`, {
        method: 'POST',
        body: JSON.stringify({ transactionReference }),
      })
      const missingKeys = [
        ...(result.missingKeys ?? []),
        ...(result.configuration?.email?.missingKeys ?? []),
      ]
      if (!['created', 'existing'].includes(result.meetingStatus)) {
        const missing = missingKeys.length ? ` Missing setup: ${[...new Set(missingKeys)].join(', ')}.` : ''
        setNotice(`Payment recorded. Meeting link status: ${result.meetingStatus.replaceAll('_', ' ')}.${missing} ${result.meetingError ?? ''}`.trim())
      } else {
        const delivery = ['email'].map((channel) => {
          const item = result.delivery.find((entry) => entry.channel === channel)
          const error = item?.error ? ` (${item.error})` : ''
          return `Email: ${item?.status ?? 'not sent'}${error}`
        })
        const missing = missingKeys.length ? ` Missing setup: ${[...new Set(missingKeys)].join(', ')}.` : ''
        setNotice(`Payment recorded and meeting link created. ${delivery.join(' · ')}.${missing} ${result.meetingError ?? ''}`.trim())
        celebrate('Bank transfer recorded')
      }
      setRecordingBooking(null)
      setTransactionReference('')
      setPaymentVerified(false)
      await load()
    } catch (requestError) {
      playUiSound('error')
      setError(getErrorMessage(requestError))
    } finally { setSaving(false) }
  }

  useEffect(() => {
    if (!info) return
    const controller = new AbortController()
    async function loadRecords() {
      try {
        const result = await fetchRecords(controller.signal)
        setItems(result.items)
        setError('')
      } catch (requestError) {
        if (!controller.signal.aborted) setError(getErrorMessage(requestError))
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void loadRecords()
    return () => controller.abort()
  }, [fetchRecords, info])

  async function changeStatus(item: ModuleRecord, status: string) {
    const destructive = status === 'cancelled' || status === 'deleted'
    if (destructive && !window.confirm(`Set "${item.title}" to ${status.replaceAll('_', ' ')}? This action will be audited.`)) return
    setError('')
    setNotice('')
    try {
      await api(`/admin/modules/${module}/${item.id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
      setNotice('Record updated and administrative action logged.')
      celebrate('Record updated')
      await load()
    } catch (requestError) { playUiSound('error'); setError(getErrorMessage(requestError)) }
  }

  async function createRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await api(`/admin/modules/${module}`, {
        method: 'POST',
        body: JSON.stringify({ title: form.title, status: form.status, data: { description: form.description } }),
      })
      setNotice('Record created and administrative action logged.')
      celebrate('Record created')
      setDialogOpen(false)
      setForm({ title: '', status: 'active', description: '' })
      await load()
    } catch (requestError) { playUiSound('error'); setError(getErrorMessage(requestError)) }
    finally { setSaving(false) }
  }

  async function saveSetting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingItem) return
    let value: unknown
    try {
      value = JSON.parse(editValue)
    } catch {
      setError('Enter a valid JSON value. Use quotes for text, true/false for booleans, and a number for numeric settings.')
      return
    }
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await api(`/admin/modules/${module}/${editingItem.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ data: { value } }),
      })
      setNotice('Platform setting updated and administrative action logged.')
      celebrate('Setting saved')
      setEditingItem(null)
      await load()
    } catch (requestError) { playUiSound('error'); setError(getErrorMessage(requestError)) }
    finally { setSaving(false) }
  }

  async function downloadReport(format: 'pdf' | 'xlsx') {
    setExporting(format)
    setError('')
    try {
      const response = await fetch(apiUrl(`/admin/reports/export?format=${format}`), { credentials: 'include' })
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null
        throw new Error(payload?.error ?? `Report download failed (${response.status}).`)
      }
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = `admin-summary.${format}`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 0)
      playUiSound('success')
    } catch (requestError) {
      playUiSound('error')
      setError(getErrorMessage(requestError))
    } finally { setExporting('') }
  }

  async function requestTestRefund(item: ModuleRecord) {
    if (!window.confirm(`Request a full test-mode refund for payment ${item.title}? This cannot be undone in the provider test account.`)) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const result = await api<{ message: string }>(`/admin/transactions/${item.id}/refund`, { method: 'POST' })
      setNotice(result.message)
      celebrate('Refund requested')
      await load()
    } catch (requestError) {
      playUiSound('error')
      setError(getErrorMessage(requestError))
    } finally { setSaving(false) }
  }

  async function refreshRefundStatus(item: ModuleRecord) {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const result = await api<{ status: string }>(`/admin/refunds/${item.id}/status`)
      setNotice(`Refund status: ${result.status}.`)
      await load()
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally { setSaving(false) }
  }

  async function liveClassAction(item: ModuleRecord, action: 'cancel' | 'end') {
    if (!window.confirm(`${action === 'end' ? 'End' : 'Cancel'} class session "${item.title}"? This will be audited.`)) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const result = await api<{ message: string }>(`/admin/live-classes/${item.id}/${action}`, { method: 'POST' })
      setNotice(`${result.message} Administrative action logged.`)
      celebrate(action === 'end' ? 'Class ended' : 'Class cancelled')
      await load()
    } catch (requestError) {
      playUiSound('error')
      setError(getErrorMessage(requestError))
    } finally { setSaving(false) }
  }

  async function deleteRecord(item: ModuleRecord) {
    const subject = module === 'recordings' ? `recording for "${item.title}"` : `class session "${item.title}"`
    if (!window.confirm(`Delete the ${subject} permanently? This action will be audited.`)) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await api(`/admin/modules/${module}/${item.id}`, { method: 'DELETE' })
      setNotice(module === 'recordings' ? 'Recording removed and administrative action logged.' : 'Class session deleted and administrative action logged.')
      celebrate(module === 'recordings' ? 'Recording removed' : 'Class deleted')
      await load()
    } catch (requestError) {
      playUiSound('error')
      setError(getErrorMessage(requestError))
    } finally { setSaving(false) }
  }

  async function createTestMeeting(item: ModuleRecord) {
    if (!window.confirm(`Create a meeting link for "${item.title}" using the configured provider?`)) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const result = await api<{ joinUrl: string }>(`/admin/live-classes/${item.id}/test-meeting`, { method: 'POST' })
      setNotice(`Meeting link created: ${result.joinUrl}`)
      celebrate('Meeting link ready')
      await load()
    } catch (requestError) {
      playUiSound('error')
      setError(getErrorMessage(requestError))
    } finally { setSaving(false) }
  }

  if (!info) return <div className="alert alert-error">This admin module is not recognized.</div>
  const canCreate = info.editable && editableModules.has(module) && can(module, 'create')
  const hasRowActions = canRefund || canRecordPayment || canCreateMeeting || canRefreshRefund || canDeleteRecords || module === 'live_classes'

  return (
    <div className="module-page">
      {burst}
      <div className="page-intro">
        <div><p className="eyebrow">PLATFORM OPERATIONS</p><h2>{info.title}</h2><p>{info.description}</p></div>
        <div className="intro-actions">
          <button className="secondary-button" onClick={() => void load()} disabled={loading}><RefreshCw size={15} /> Refresh</button>
          {canExportReport && <><button className="secondary-button" onClick={() => void downloadReport('xlsx')} disabled={Boolean(exporting)}><Download size={15} /> {exporting === 'xlsx' ? 'Preparing…' : 'Download XLSX'}</button><button className="secondary-button" onClick={() => void downloadReport('pdf')} disabled={Boolean(exporting)}><Download size={15} /> {exporting === 'pdf' ? 'Preparing…' : 'Download PDF'}</button></>}
          {canCreate && <button className="primary-button" onClick={() => setDialogOpen(true)}><Plus size={17} /> Add record</button>}
        </div>
      </div>
      {error && <div role="alert" className="alert alert-error">{error}</div>}
      {notice && <div role="status" className="alert alert-success">{notice}</div>}
      <section className="panel data-panel">
        <div className="table-toolbar">
          <div className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${info.title.toLowerCase()}`} aria-label={`Search ${info.title}`} /></div>
          <span className="result-count">{loading ? 'Loading…' : `${filtered.length} records`}</span>
        </div>
        <div className="table-scroll"><table>
          <thead><tr><th>Record</th><th>Status</th><th>Details</th><th>Created</th>{canEdit && (info.statuses || module === 'configuration' || module === 'maintenance') && <th className="align-right">Update</th>}{hasRowActions && <th className="align-right">Actions</th>}</tr></thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.id}>
                <td><div className="person-cell"><span className="record-icon"><FileText size={16} /></span><span><strong>{item.title}</strong><small>{item.id.slice(0, 8)}</small></span></div></td>
                <td><span className={`status-pill status-${item.status}`}>{item.status.replaceAll('_', ' ')}</span></td>
                <td><div className="record-details">{Object.entries(item.data ?? {}).slice(0, 4).map(([key, value]) => <span key={key}><b>{key.replaceAll(/([A-Z])/g, ' $1').replaceAll('_', ' ')}:</b> {readableValue(value)}</span>)}</div></td>
                <td>{item.created_at ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(item.created_at)) : '—'}</td>
                {canEdit && info.statuses && <td className="align-right">{item.status === 'paid' && module === 'bookings' ? <span className="table-secondary">Payment recorded</span> : <select className="table-select" aria-label={`Update status for ${item.title}`} value={item.status} onChange={(event) => void changeStatus(item, event.target.value)}>{info.statuses.filter((status) => module !== 'bookings' || status !== 'paid').map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select>}</td>}
                {canEdit && (module === 'configuration' || module === 'maintenance') && <td className="align-right"><button className="table-action" onClick={() => { setEditingItem(item); setEditValue(JSON.stringify(item.data?.value ?? null, null, 2)); setError('') }}><Pencil size={12} /> Edit value</button></td>}
                {hasRowActions && <td className="align-right">
                  {canRefund && item.status === 'succeeded' && item.data?.provider === 'razorpay' && Boolean(item.data?.providerTransactionId) && <button className="table-action danger-action" disabled={saving} onClick={() => void requestTestRefund(item)}><RotateCcw size={12} /> Full test refund</button>}
                  {canRecordPayment && item.status === 'approved' && <button className="table-action" disabled={saving} onClick={() => { setRecordingBooking(item); setTransactionReference(''); setPaymentVerified(false); setError('') }}>Record bank transfer</button>}
                  {canCreateMeeting && item.status === 'scheduled' && !item.data?.meetingUrl && !['creating', 'created', 'unknown'].includes(String(item.data?.meetingCreationStatus)) && <button className="table-action" disabled={saving} onClick={() => void createTestMeeting(item)}><Video size={12} /> Create meeting link</button>}
                  {canRefreshRefund && ['pending', 'unknown'].includes(item.status) && Boolean(item.data?.providerRefundId) && <button className="table-action" disabled={saving} onClick={() => void refreshRefundStatus(item)}><RefreshCw size={12} /> Check provider status</button>}
                  {module === 'live_classes' && ['scheduled', 'ongoing'].includes(item.status) && (
                    <>
                      {item.status === 'ongoing' && <button className="table-action danger-action" disabled={saving} onClick={() => void liveClassAction(item, 'end')}><Video size={12} /> End class</button>}
                      <button className="table-action danger-action" disabled={saving} onClick={() => void liveClassAction(item, 'cancel')}><X size={12} /> Cancel class</button>
                    </>
                  )}
                  {canDeleteRecords && <button className="table-action danger-action" disabled={saving} onClick={() => void deleteRecord(item)}><Trash2 size={12} /> {module === 'recordings' ? 'Delete recording' : 'Delete class'}</button>}
                </td>}
              </tr>
            ))}
            {!loading && filtered.length === 0 && <tr><td colSpan={(canEdit && (info.statuses || module === 'configuration' || module === 'maintenance') ? 5 : 4) + (hasRowActions ? 1 : 0)}><div className="table-empty"><FileText size={25} /><strong>No records available</strong><span>Records appear here when the connected platform workflow creates them.</span></div></td></tr>}
            {loading && <tr><td colSpan={(canEdit && (info.statuses || module === 'configuration' || module === 'maintenance') ? 5 : 4) + (hasRowActions ? 1 : 0)}><div className="table-empty"><span className="spinner" /> Loading records…</div></td></tr>}
          </tbody>
        </table></div>
      </section>
      {editingItem && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingItem(null) }}>
          <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="edit-setting-title">
            <div className="dialog-heading"><div><p className="eyebrow">PLATFORM CONFIGURATION</p><h3 id="edit-setting-title">{editingItem.title}</h3></div><button className="icon-button" aria-label="Close dialog" onClick={() => setEditingItem(null)}><X size={19} /></button></div>
            <form className="dialog-form" onSubmit={saveSetting}>
              <label>JSON value<textarea rows={5} value={editValue} onChange={(event) => setEditValue(event.target.value)} /></label>
              <small>Only the setting type and range supported by the server will be accepted.</small>
              {error && <div role="alert" className="form-error">{error}</div>}
              <div className="dialog-actions"><button type="button" className="secondary-button" onClick={() => setEditingItem(null)}>Cancel</button><button type="submit" className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save setting'}</button></div>
            </form>
          </section>
        </div>
      )}
      {recordingBooking && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setRecordingBooking(null) }}>
          <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="record-bank-transfer-title">
            <div className="dialog-heading">
              <div><p className="eyebrow">OFFLINE PAYMENT</p><h3 id="record-bank-transfer-title">Record bank transfer</h3></div>
              <button className="icon-button" aria-label="Close dialog" disabled={saving} onClick={() => setRecordingBooking(null)}><X size={19} /></button>
            </div>
            <form className="dialog-form" onSubmit={(event) => void recordBankTransfer(event)}>
              <p>{recordingBooking.title} · Rs. {readableValue(recordingBooking.data?.amount)}</p>
              <label>Bank transaction reference<input required minLength={3} maxLength={128} value={transactionReference} onChange={(event) => setTransactionReference(event.target.value)} /></label>
              <label className="check-label"><input type="checkbox" checked={paymentVerified} onChange={(event) => setPaymentVerified(event.target.checked)} /> I verified this transfer was received.</label>
              <small>Recording is permanent and audited. If meeting or email setup is missing, payment will still be recorded and delivery can be retried from Meeting checks.</small>
              {error && <div role="alert" className="form-error">{error}</div>}
              <div className="dialog-actions">
                <button type="button" className="secondary-button" disabled={saving} onClick={() => setRecordingBooking(null)}>Cancel</button>
                <button type="submit" className="primary-button" disabled={saving || !paymentVerified || transactionReference.trim().length < 3}>{saving ? 'Recording…' : 'Confirm payment'}</button>
              </div>
            </form>
          </section>
        </div>
      )}
      {dialogOpen && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialogOpen(false) }}>
          <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="create-record-title">
            <div className="dialog-heading"><div><p className="eyebrow">{info.title.toUpperCase()}</p><h3 id="create-record-title">Add record</h3></div><button className="icon-button" aria-label="Close dialog" onClick={() => setDialogOpen(false)}><X size={19} /></button></div>
            <form className="dialog-form" onSubmit={createRecord}>
              <label>Title<input required maxLength={200} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
              <label>Status<input required maxLength={60} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} /></label>
              <label>Details<textarea rows={4} maxLength={2000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
              {error && <div role="alert" className="form-error">{error}</div>}
              <div className="dialog-actions"><button type="button" className="secondary-button" onClick={() => setDialogOpen(false)}>Cancel</button><button type="submit" className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save record'}</button></div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}
