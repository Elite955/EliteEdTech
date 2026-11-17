import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Check, Plus, Save, ShieldCheck, X } from 'lucide-react'
import type { Permission } from '../auth/context'
import { useAuth } from '../auth/useAuth'
import { api, getErrorMessage } from '../lib/api'

type Role = {
  id: string
  code: string
  name: string
  description: string
  is_system: boolean
  permissions: Permission[]
}

const moduleLabels: Record<string, string> = {
  dashboard: 'Dashboard', students: 'Students', teachers: 'Teachers', admins: 'Admin accounts',
  roles: 'Roles & permissions', bookings: 'Bookings', live_classes: 'Live classes',
  chat_moderation: 'Chat moderation', support: 'Support', transactions: 'Transactions',
  refunds: 'Refunds', payouts: 'Payouts', revenue_analytics: 'Revenue analytics',
  recordings: 'Recordings', attendance: 'Attendance', reports: 'Reports',
  activity_logs: 'Activity logs', notifications: 'Notifications', templates: 'Message templates',
  configuration: 'Configuration', integrations: 'Integrations', security: 'Security',
  backups: 'Backups', maintenance: 'Maintenance mode',
}
const actions = ['view', 'create', 'edit', 'delete', 'approve', 'reject', 'export', 'manage']

export function RoleManagement() {
  const { can } = useAuth()
  const [roles, setRoles] = useState<Role[]>([])
  const [catalog, setCatalog] = useState<Permission[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [draft, setDraft] = useState<Permission[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [newRole, setNewRole] = useState({ name: '', code: '', description: '' })
  const selectedIdRef = useRef('')
  const mayManage = can('roles', 'manage')
  const selected = roles.find((role) => role.id === selectedId)
  const modules = useMemo(() => [...new Set(catalog.map((permission) => permission.module))], [catalog])

  const fetchRoleData = useCallback((signal?: AbortSignal) => Promise.all([
    api<{ items: Role[] }>('/admin/roles', { signal }),
    api<{ items: Permission[] }>('/admin/permissions', { signal }),
  ]), [])

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setLoading(true)
      setError('')
    }
    try {
      const [roleResult, permissionResult] = await fetchRoleData()
      setRoles(roleResult.items)
      setCatalog(permissionResult.items)
      const nextId = roleResult.items.some((role) => role.id === selectedIdRef.current) ? selectedIdRef.current : roleResult.items[0]?.id ?? ''
      selectedIdRef.current = nextId
      setSelectedId(nextId)
      setDraft(roleResult.items.find((role) => role.id === nextId)?.permissions ?? [])
    } catch (requestError) { setError(getErrorMessage(requestError)) }
    finally { setLoading(false) }
  }, [fetchRoleData])

  useEffect(() => {
    const controller = new AbortController()
    async function loadRoles() {
      try {
        const [roleResult, permissionResult] = await fetchRoleData(controller.signal)
        setRoles(roleResult.items)
        setCatalog(permissionResult.items)
        const nextId = roleResult.items.some((role) => role.id === selectedIdRef.current) ? selectedIdRef.current : roleResult.items[0]?.id ?? ''
        selectedIdRef.current = nextId
        setSelectedId(nextId)
        setDraft(roleResult.items.find((role) => role.id === nextId)?.permissions ?? [])
        setError('')
      } catch (requestError) {
        if (!controller.signal.aborted) setError(getErrorMessage(requestError))
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void loadRoles()
    return () => controller.abort()
  }, [fetchRoleData])

  function togglePermission(module: string, action: string) {
    setDraft((current) => current.some((item) => item.module === module && item.action === action)
      ? current.filter((item) => item.module !== module || item.action !== action)
      : [...current, { module, action }])
  }

  async function savePermissions() {
    if (!selected) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await api(`/admin/roles/${selected.id}/permissions`, { method: 'PUT', body: JSON.stringify({ permissions: draft }) })
      setNotice(`Permissions updated for ${selected.name}.`)
      await load()
    } catch (requestError) { setError(getErrorMessage(requestError)) }
    finally { setSaving(false) }
  }

  async function createRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const result = await api<{ item: Role }>('/admin/roles', { method: 'POST', body: JSON.stringify(newRole) })
      setCreateOpen(false)
      setNewRole({ name: '', code: '', description: '' })
      selectedIdRef.current = result.item.id
      await load()
      setSelectedId(result.item.id)
      setNotice('Custom role created. Assign only the permissions it needs.')
    } catch (requestError) { setError(getErrorMessage(requestError)) }
    finally { setSaving(false) }
  }

  return (
    <div className="roles-page">
      <div className="page-intro">
        <div><p className="eyebrow">ACCESS CONTROL</p><h2>Roles & permissions</h2><p>Grant the minimum module-level access required for each administrator role.</p></div>
        <div className="intro-actions">
          {mayManage && <button className="secondary-button" onClick={() => setCreateOpen(true)}><Plus size={16} /> Custom role</button>}
          {mayManage && selected?.code !== 'super_admin' && <button className="primary-button" disabled={saving} onClick={() => void savePermissions()}><Save size={16} /> {saving ? 'Saving…' : 'Save permissions'}</button>}
        </div>
      </div>
      {error && <div role="alert" className="alert alert-error">{error}</div>}
      {notice && <div role="status" className="alert alert-success">{notice}</div>}
      {loading ? <div className="panel table-empty"><span className="spinner" /> Loading roles…</div> : (
        <div className="roles-layout">
          <section className="panel role-list">
            <div className="panel-heading"><div><h3>Administrative roles</h3><p>{roles.length} role types</p></div></div>
            {roles.map((role) => <button key={role.id} className={`role-option${role.id === selectedId ? ' selected' : ''}`} onClick={() => { selectedIdRef.current = role.id; setSelectedId(role.id); setDraft(role.permissions) }}>
              <span className="role-option-icon"><ShieldCheck size={18} /></span>
              <span><strong>{role.name}</strong><small>{role.description}</small></span>
              {role.is_system && <span className="system-tag">System</span>}
            </button>)}
          </section>
          <section className="panel permissions-panel">
            {selected ? <>
              <div className="panel-heading permission-heading"><div><h3>{selected.name}</h3><p>{selected.description}</p></div><span className="permission-count">{draft.length} grants</span></div>
              {selected.code === 'super_admin' && <div className="alert alert-info">Super Admin retains full access and cannot be restricted.</div>}
              <div className="permission-table-scroll"><table className="permission-table">
                <thead><tr><th>Module</th>{actions.map((action) => <th key={action}>{action}</th>)}</tr></thead>
                <tbody>{modules.map((module) => <tr key={module}>
                  <td>{moduleLabels[module] ?? module}</td>
                  {actions.map((action) => {
                    const checked = draft.some((permission) => permission.module === module && permission.action === action)
                    return <td key={action}><button type="button" className={`permission-check${checked ? ' checked' : ''}`} disabled={!mayManage || selected.code === 'super_admin'} aria-label={`${checked ? 'Revoke' : 'Grant'} ${action} ${module}`} onClick={() => togglePermission(module, action)}>{checked && <Check size={14} />}</button></td>
                  })}
                </tr>)}</tbody>
              </table></div>
            </> : <div className="table-empty">Select a role to review its permissions.</div>}
          </section>
        </div>
      )}
      {createOpen && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreateOpen(false) }}>
          <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="create-role-title">
            <div className="dialog-heading"><div><p className="eyebrow">ACCESS CONTROL</p><h3 id="create-role-title">Create custom role</h3></div><button className="icon-button" aria-label="Close dialog" onClick={() => setCreateOpen(false)}><X size={19} /></button></div>
            <form className="dialog-form" onSubmit={createRole}>
              <label>Role name<input required maxLength={100} value={newRole.name} onChange={(event) => setNewRole({ ...newRole, name: event.target.value, code: event.target.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') })} /></label>
              <label>Role code<input required pattern="[a-z][a-z0-9_]{2,59}" value={newRole.code} onChange={(event) => setNewRole({ ...newRole, code: event.target.value })} /><small>Lowercase letters, numbers, and underscores only.</small></label>
              <label>Description<input maxLength={500} value={newRole.description} onChange={(event) => setNewRole({ ...newRole, description: event.target.value })} /></label>
              {error && <div role="alert" className="form-error">{error}</div>}
              <div className="dialog-actions"><button type="button" className="secondary-button" onClick={() => setCreateOpen(false)}>Cancel</button><button type="submit" className="primary-button" disabled={saving}>{saving ? 'Creating…' : 'Create role'}</button></div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}
