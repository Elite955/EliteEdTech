import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Plus, Shield, UserCog, X } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import { api, getErrorMessage } from '../lib/api'

type AdminAccount = {
  id: string
  name: string
  email: string
  phone: string | null
  status: string
  role_code: string
  role_name: string
  last_login_at: string | null
  session_active: boolean
  created_at: string
}
type AdminRole = { code: string; name: string }

export function AdminDirectory() {
  const { can, user } = useAuth()
  const [items, setItems] = useState<AdminAccount[]>([])
  const [roles, setRoles] = useState<AdminRole[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', roleCode: 'operations_admin' })

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setLoading(true)
      setError('')
    }
    try {
      const [adminResult, roleResult] = await Promise.all([
        api<{ items: AdminAccount[] }>('/admin/admins'),
        api<{ items: AdminRole[] }>('/admin/roles'),
      ])
      setItems(adminResult.items)
      setRoles(roleResult.items)
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load(false) }, [load])

  async function createAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await api('/admin/admins', { method: 'POST', body: JSON.stringify(form) })
      setNotice('Administrator account created. They will be asked to enroll MFA at first sign-in.')
      setForm({ name: '', email: '', password: '', roleCode: 'operations_admin' })
      setDialogOpen(false)
      await load()
    } catch (requestError) { setError(getErrorMessage(requestError)) }
    finally { setSaving(false) }
  }

  async function changeStatus(admin: AdminAccount) {
    const status = admin.status === 'active' ? 'suspended' : 'active'
    if (!window.confirm(`${status === 'suspended' ? 'Suspend' : 'Activate'} ${admin.name}'s administrator account?`)) return
    setError('')
    try {
      await api(`/admin/admins/${admin.id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
      setNotice(`${admin.name} is now ${status}. Active sessions are revoked when access is suspended.`)
      await load()
    } catch (requestError) { setError(getErrorMessage(requestError)) }
  }

  async function changeRole(admin: AdminAccount, roleCode: string) {
    setError('')
    setNotice('')
    try {
      await api(`/admin/admins/${admin.id}`, { method: 'PATCH', body: JSON.stringify({ roleCode }) })
      setNotice(`${admin.name} now has the ${roles.find((role) => role.code === roleCode)?.name ?? roleCode} role.`)
      await load()
    } catch (requestError) { setError(getErrorMessage(requestError)) }
  }

  async function revokeSessions(admin: AdminAccount) {
    if (!window.confirm(`Revoke all active sessions for ${admin.name}?`)) return
    setError('')
    try {
      const result = await api<{ message: string }>(`/admin/admins/${admin.id}/revoke-sessions`, { method: 'POST' })
      setNotice(result.message)
      await load()
    } catch (requestError) { setError(getErrorMessage(requestError)) }
  }

  return (
    <div className="directory-page">
      <div className="page-intro">
        <div><p className="eyebrow">USER MANAGEMENT</p><h2>Admin accounts</h2><p>Delegate platform responsibilities and revoke access when required.</p></div>
        {user?.roleCode === 'super_admin' && can('admins', 'create') && <button className="primary-button" onClick={() => setDialogOpen(true)}><Plus size={17} /> Add administrator</button>}
      </div>
      {error && <div role="alert" className="alert alert-error">{error}</div>}
      {notice && <div role="status" className="alert alert-success">{notice}</div>}
      <section className="panel data-panel">
        <div className="table-toolbar"><div className="toolbar-note"><Shield size={17} /> Only Super Admins can create administrator accounts and assign roles.</div><span className="result-count">{loading ? 'Loading…' : `${items.length} accounts`}</span></div>
        <div className="table-scroll"><table>
          <thead><tr><th>Administrator</th><th>Role</th><th>Account</th><th>Last sign-in</th><th>Session</th>{can('admins', 'edit') && <th className="align-right">Access</th>}</tr></thead>
          <tbody>
            {items.map((admin) => <tr key={admin.id}>
              <td><div className="person-cell"><span className="person-avatar admin"><UserCog size={16} /></span><span><strong>{admin.name}</strong><small>{admin.email}</small></span></div></td>
              <td>{user?.roleCode === 'super_admin'
                ? <select className="table-select" aria-label={`Role for ${admin.name}`} value={admin.role_code} onChange={(event) => void changeRole(admin, event.target.value)}>{roles.map((role) => <option key={role.code} value={role.code}>{role.name}</option>)}</select>
                : <span className="role-tag">{admin.role_name}</span>}</td>
              <td><span className={`status-pill status-${admin.status}`}>{admin.status}</span></td>
              <td>{admin.last_login_at ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(admin.last_login_at)) : 'Never'}</td>
              <td><span className={`status-pill ${admin.session_active ? 'status-active' : 'status-inactive'}`}>{admin.session_active ? 'Active' : 'Signed out'}</span></td>
              {can('admins', 'edit') && <td className="align-right">
                <div className="row-actions">
                  {user?.roleCode === 'super_admin' && admin.session_active && <button className="table-action danger-action" onClick={() => void revokeSessions(admin)}>Revoke session</button>}
                  <button className={`table-action ${admin.status === 'active' ? 'danger-action' : ''}`} disabled={admin.id === user?.id && admin.status === 'active'} onClick={() => void changeStatus(admin)}>{admin.status === 'active' ? 'Suspend' : 'Activate'}</button>
                </div>
              </td>}
            </tr>)}
            {!loading && items.length === 0 && <tr><td colSpan={can('admins', 'edit') ? 6 : 5}><div className="table-empty">No administrator accounts found.</div></td></tr>}
            {loading && <tr><td colSpan={can('admins', 'edit') ? 6 : 5}><div className="table-empty"><span className="spinner" /> Loading administrator accounts…</div></td></tr>}
          </tbody>
        </table></div>
      </section>
      {dialogOpen && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialogOpen(false) }}>
          <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="create-admin-title">
            <div className="dialog-heading"><div><p className="eyebrow">ACCESS CONTROL</p><h3 id="create-admin-title">Add administrator</h3></div><button className="icon-button" aria-label="Close dialog" onClick={() => setDialogOpen(false)}><X size={19} /></button></div>
            <form className="dialog-form" onSubmit={createAdmin}>
              <label>Full name<input required maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
              <label>Work email<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
              <label>Temporary password<input required type="password" minLength={12} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /><small>At least 12 characters. Share through an approved secure channel.</small></label>
              <label>Administrative role<select value={form.roleCode} onChange={(event) => setForm({ ...form, roleCode: event.target.value })}>{roles.filter((role) => role.code !== 'super_admin').map((role) => <option key={role.code} value={role.code}>{role.name}</option>)}</select></label>
              {error && <div role="alert" className="form-error">{error}</div>}
              <div className="dialog-actions"><button type="button" className="secondary-button" onClick={() => setDialogOpen(false)}>Cancel</button><button type="submit" className="primary-button" disabled={saving}>{saving ? 'Creating…' : 'Create administrator'}</button></div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}
