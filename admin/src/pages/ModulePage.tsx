import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { FileText, Pencil, Plus, RefreshCw, Search, X } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import { api, getErrorMessage } from '../lib/api'

type ModuleRecord = { id: string; title: string; status: string; created_at: string; data: Record<string, unknown> }

const moduleInfo: Record<string, { title: string; description: string; editable?: boolean; statuses?: string[] }> = {
  bookings: { title: 'Bookings', description: 'Review booking requests, class schedules, and booking status.', statuses: ['pending', 'approved', 'rejected', 'paid', 'completed', 'cancelled'] },
  live_classes: { title: 'Live classes', description: 'Monitor scheduled and ongoing Zoom sessions. Emergency termination is logged.', statuses: ['scheduled', 'ongoing', 'completed', 'cancelled'] },
  chat_moderation: { title: 'Global chat moderation', description: 'Review messages that authorized moderators are permitted to access.', statuses: ['visible', 'hidden', 'deleted'] },
  support: { title: 'Support & complaints', description: 'Track user issues, prioritize complaints, and update ticket status.', statuses: ['open', 'in_progress', 'resolved', 'closed'], editable: true },
  transactions: { title: 'Transactions', description: 'Read-only transaction history. Razorpay actions require configured provider credentials.' },
  refunds: { title: 'Refunds', description: 'Refund records are read-only until Razorpay test credentials and refund approval workflow are configured.' },
  payouts: { title: 'Teacher payouts', description: 'Payouts are not initiated by the admin console. Connect the approved financial provider before enabling payouts.' },
  revenue_analytics: { title: 'Revenue analytics', description: 'Revenue summaries are based on recorded payment rows; no external payment data is fabricated.' },
  recordings: { title: 'Recordings', description: 'Only recordings with recorded participant consent are listed.' },
  attendance: { title: 'Attendance', description: 'Class attendance records supplied by the session workflow.' },
  reports: { title: 'Reports & analytics', description: 'Create report definitions and review generated report records.', editable: true },
  activity_logs: { title: 'Administrative activity logs', description: 'A chronological audit trail of administrative actions.' },
  notifications: { title: 'Notification centre', description: 'Review notification delivery status. Sending requires configured provider credentials.' },
  announcements: { title: 'Announcements', description: 'Create announcement records. Delivery is not sent until a notification provider workflow is configured.', editable: true },
  templates: { title: 'Message templates', description: 'Manage reusable email and WhatsApp message template records.', editable: true },
  configuration: { title: 'Platform configuration', description: 'Manage selected non-secret platform settings. Secrets belong in environment configuration, never here.' },
  integrations: { title: 'Integrations', description: 'Provider readiness is checked from environment configuration; secrets are never displayed.' },
  security: { title: 'Security management', description: 'Review security events and administrative access activity.' },
  backups: { title: 'Backup management', description: 'Backup status is not connected to a provider. No backup is claimed unless an integration reports it.' },
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
  const canEdit = can(module, ['live_classes', 'chat_moderation', 'configuration', 'maintenance'].includes(module) ? 'manage' : 'edit')
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return query ? items.filter((item) => `${item.title} ${item.status} ${JSON.stringify(item.data ?? {})}`.toLowerCase().includes(query)) : items
  }, [items, search])

  const load = useCallback(async (showLoading = true) => {
    if (!info) return
    if (showLoading) {
      setLoading(true)
      setError('')
    }
    try {
      const result = await api<{ items: ModuleRecord[] }>(`/admin/modules/${module}`)
      setItems(result.items)
    } catch (requestError) { setError(getErrorMessage(requestError)) }
    finally { setLoading(false) }
  }, [module, info])

  useEffect(() => { void load(false) }, [load])

  async function changeStatus(item: ModuleRecord, status: string) {
    const destructive = status === 'cancelled' || status === 'deleted'
    if (destructive && !window.confirm(`Set "${item.title}" to ${status.replaceAll('_', ' ')}? This action will be audited.`)) return
    setError('')
    setNotice('')
    try {
      await api(`/admin/modules/${module}/${item.id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
      setNotice('Record updated and administrative action logged.')
      await load()
    } catch (requestError) { setError(getErrorMessage(requestError)) }
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
      setDialogOpen(false)
      setForm({ title: '', status: 'active', description: '' })
      await load()
    } catch (requestError) { setError(getErrorMessage(requestError)) }
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
      setEditingItem(null)
      await load()
    } catch (requestError) { setError(getErrorMessage(requestError)) }
    finally { setSaving(false) }
  }

  if (!info) return <div className="alert alert-error">This admin module is not recognized.</div>
  const canCreate = info.editable && editableModules.has(module) && can(module, 'create')

  return (
    <div className="module-page">
      <div className="page-intro">
        <div><p className="eyebrow">PLATFORM OPERATIONS</p><h2>{info.title}</h2><p>{info.description}</p></div>
        <div className="intro-actions">
          <button className="secondary-button" onClick={() => void load()} disabled={loading}><RefreshCw size={15} /> Refresh</button>
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
          <thead><tr><th>Record</th><th>Status</th><th>Details</th><th>Created</th>{canEdit && (info.statuses || module === 'configuration' || module === 'maintenance') && <th className="align-right">Update</th>}</tr></thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.id}>
                <td><div className="person-cell"><span className="record-icon"><FileText size={16} /></span><span><strong>{item.title}</strong><small>{item.id.slice(0, 8)}</small></span></div></td>
                <td><span className={`status-pill status-${item.status}`}>{item.status.replaceAll('_', ' ')}</span></td>
                <td><div className="record-details">{Object.entries(item.data ?? {}).slice(0, 4).map(([key, value]) => <span key={key}><b>{key.replaceAll(/([A-Z])/g, ' $1').replaceAll('_', ' ')}:</b> {readableValue(value)}</span>)}</div></td>
                <td>{item.created_at ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(item.created_at)) : '—'}</td>
                {canEdit && info.statuses && <td className="align-right"><select className="table-select" aria-label={`Update status for ${item.title}`} value={item.status} onChange={(event) => void changeStatus(item, event.target.value)}>{info.statuses.map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select></td>}
                {canEdit && (module === 'configuration' || module === 'maintenance') && <td className="align-right"><button className="table-action" onClick={() => { setEditingItem(item); setEditValue(JSON.stringify(item.data?.value ?? null, null, 2)); setError('') }}><Pencil size={12} /> Edit value</button></td>}
              </tr>
            ))}
            {!loading && filtered.length === 0 && <tr><td colSpan={canEdit && (info.statuses || module === 'configuration' || module === 'maintenance') ? 5 : 4}><div className="table-empty"><FileText size={25} /><strong>No records available</strong><span>Records appear here when the connected platform workflow creates them.</span></div></td></tr>}
            {loading && <tr><td colSpan={canEdit && (info.statuses || module === 'configuration' || module === 'maintenance') ? 5 : 4}><div className="table-empty"><span className="spinner" /> Loading records…</div></td></tr>}
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
