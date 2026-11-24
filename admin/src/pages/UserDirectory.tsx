import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Download, Plus, Search, UserRound, X } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import { useSuccessBurst } from '../components/useSuccessBurst'
import { api, apiUrl, getErrorMessage } from '../lib/api'
import { playUiSound } from '../lib/sound'

type Person = {
  id: string
  name: string
  email: string
  phone: string | null
  status: string
  created_at: string
  age?: number | null
  grade?: string | null
  subjects?: string[]
  bio?: string | null
  hourly_rate?: number | null
  approved?: boolean
}

export function UserDirectory({ role }: { role: 'student' | 'teacher' }) {
  const { can } = useAuth()
  const { celebrate, burst } = useSuccessBurst()
  const [items, setItems] = useState<Person[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingPerson, setEditingPerson] = useState<Person | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkStatus, setBulkStatus] = useState<'active' | 'suspended' | 'deactivated'>('suspended')
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', age: '', grade: '', subjects: '', bio: '', hourlyRate: '' })
  const canCreate = can(`${role}s`, 'create')
  const canEdit = can(`${role}s`, 'edit')
  const canExport = can(`${role}s`, 'export')

  const fetchPeople = useCallback((signal?: AbortSignal) => (
    api<{ items: Person[] }>(`/admin/${role}s?search=${encodeURIComponent(search)}`, { signal })
  ), [role, search])

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setLoading(true)
      setError('')
    }
    try {
      const result = await fetchPeople()
      setItems(result.items)
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setLoading(false)
    }
  }, [fetchPeople])

  useEffect(() => {
    const controller = new AbortController()
    async function loadPeople() {
      try {
        const result = await fetchPeople(controller.signal)
        setItems(result.items)
        setError('')
      } catch (requestError) {
        if (!controller.signal.aborted) setError(getErrorMessage(requestError))
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void loadPeople()
    return () => controller.abort()
  }, [fetchPeople])

  async function toggleStatus(item: Person) {
    const status = item.status === 'active' ? 'suspended' : 'active'
    if (!window.confirm(`${status === 'suspended' ? 'Suspend' : 'Activate'} ${item.name}'s account?`)) return
    setError('')
    setNotice('')
    try {
      await api(`/admin/${role}s/${item.id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
      setNotice(`${item.name} is now ${status}.`)
      celebrate('Account updated', `${item.name} is now ${status}.`)
      await load()
    } catch (requestError) {
      playUiSound('error')
      setError(getErrorMessage(requestError))
    }
  }

  function openCreateDialog() {
    setEditingPerson(null)
    setForm({ name: '', email: '', password: '', phone: '', age: '', grade: '', subjects: '', bio: '', hourlyRate: '' })
    setError('')
    setNotice('')
    setDialogOpen(true)
  }

  function openEditDialog(item: Person) {
    setEditingPerson(item)
    setForm({
      name: item.name,
      email: item.email,
      password: '',
      phone: item.phone ?? '',
      age: item.age == null ? '' : String(item.age),
      grade: item.grade ?? '',
      subjects: item.subjects?.join(', ') ?? '',
      bio: item.bio ?? '',
      hourlyRate: item.hourly_rate == null ? '' : String(item.hourly_rate),
    })
    setError('')
    setNotice('')
    setDialogOpen(true)
  }

  async function sendPasswordReset(item: Person) {
    if (item.status !== 'active' || !window.confirm(`Send a password reset link to ${item.email}?`)) return
    setError('')
    setNotice('')
    try {
      const result = await api<{ message: string }>(`/admin/${role}s/${item.id}/password-reset`, { method: 'POST' })
      setNotice(result.message)
      celebrate('Reset link sent', item.email)
    } catch (requestError) {
      playUiSound('error')
      setError(getErrorMessage(requestError))
    }
  }

  async function exportAccounts() {
    setError('')
    try {
      const response = await fetch(apiUrl(`/admin/${role}s/export`), { credentials: 'include' })
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null
        throw new Error(payload?.error ?? `Export failed (${response.status}).`)
      }
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = `${role}s.csv`
      link.click()
      URL.revokeObjectURL(url)
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    }
  }

  async function applyBulkStatus() {
    if (!selectedIds.length) return
    if (!window.confirm(`${bulkStatus === 'deactivated' ? 'Deactivate' : bulkStatus === 'active' ? 'Activate' : 'Suspend'} ${selectedIds.length} selected account(s)?`)) return
    setError('')
    setNotice('')
    try {
      const result = await api<{ message: string }>(`/admin/${role}s/bulk`, {
        method: 'PATCH',
        body: JSON.stringify({ ids: selectedIds, status: bulkStatus }),
      })
      setNotice(result.message)
      celebrate('Bulk update complete', `${selectedIds.length} account(s) updated.`)
      setSelectedIds([])
      await load()
    } catch (requestError) {
      playUiSound('error')
      setError(getErrorMessage(requestError))
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const profile = role === 'student' ? {
        age: form.age ? Number(form.age) : null,
        grade: form.grade || null,
      } : {
        subjects: form.subjects.split(',').map((subject) => subject.trim()).filter(Boolean),
        bio: form.bio.trim() || null,
        hourlyRate: form.hourlyRate ? Number(form.hourlyRate) : null,
      }
      if (editingPerson) {
        await api(`/admin/${role}s/${editingPerson.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: form.name, email: form.email, phone: form.phone || null, ...profile }),
        })
        setNotice(`${role === 'student' ? 'Student' : 'Teacher'} account updated.`)
        celebrate('Account updated')
      } else {
        await api(`/admin/${role}s`, {
          method: 'POST',
          body: JSON.stringify({ name: form.name, email: form.email, password: form.password, phone: form.phone || null, ...profile }),
        })
        setNotice(`${role === 'student' ? 'Student' : 'Teacher'} account created.`)
        celebrate('Account created')
      }
      setDialogOpen(false)
      setEditingPerson(null)
      setForm({ name: '', email: '', password: '', phone: '', age: '', grade: '', subjects: '', bio: '', hourlyRate: '' })
      await load()
    } catch (requestError) {
      playUiSound('error')
      setError(getErrorMessage(requestError))
    } finally {
      setSaving(false)
    }
  }

  const heading = role === 'student' ? 'Students' : 'Teachers'
  return (
    <div className="directory-page">
      {burst}
      <div className="page-intro">
        <div><p className="eyebrow">USER MANAGEMENT</p><h2>{heading}</h2><p>Search, review, and manage {role} accounts across the platform.</p></div>
        <div className="intro-actions">
          {canExport && <button className="secondary-button" onClick={() => void exportAccounts()}><Download size={15} /> Export CSV</button>}
          {canCreate && <button className="primary-button" onClick={openCreateDialog}><Plus size={17} /> Add {role}</button>}
        </div>
      </div>
      {error && <div role="alert" className="alert alert-error">{error}</div>}
      {notice && <div role="status" className="alert alert-success">{notice}</div>}
      <section className="panel data-panel">
        <div className="table-toolbar">
          <div className="search-field"><Search size={17} /><input value={search} onChange={(event) => { setSearch(event.target.value); setSelectedIds([]) }} placeholder={`Search ${role}s by name, email or ID`} aria-label={`Search ${role}s`} /></div>
          <div className="toolbar-actions">
            {canEdit && selectedIds.length > 0 && <div className="bulk-action">
              <span>{selectedIds.length} selected</span>
              <select aria-label="Bulk account status" value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value as typeof bulkStatus)}>
                <option value="suspended">Suspend</option><option value="active">Activate</option><option value="deactivated">Deactivate</option>
              </select>
              <button className="table-action" onClick={() => void applyBulkStatus()}>Apply</button>
            </div>}
            <span className="result-count">{loading ? 'Loading…' : `${items.length} account${items.length === 1 ? '' : 's'}`}</span>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead><tr>{canEdit && <th><input type="checkbox" aria-label="Select all accounts on this page" checked={items.length > 0 && items.every((item) => selectedIds.includes(item.id))} onChange={(event) => setSelectedIds(event.target.checked ? items.map((item) => item.id) : [])} /></th>}<th>Name</th><th>Contact</th><th>{role === 'student' ? 'Grade / age' : 'Subjects / rate'}</th><th>Status</th><th>Joined</th>{canEdit && <th className="align-right">Action</th>}</tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  {canEdit && <td><input type="checkbox" aria-label={`Select ${item.name}`} checked={selectedIds.includes(item.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} /></td>}
                  <td><div className="person-cell"><span className={`person-avatar ${role}`}><UserRound size={16} /></span><span><strong>{item.name}</strong><small>{item.id.slice(0, 8)}</small></span></div></td>
                  <td><span className="table-primary">{item.email}</span><small className="table-secondary">{item.phone || 'No phone provided'}</small></td>
                  <td>{role === 'student' ? <>{item.grade || '—'}{item.age ? <small className="table-secondary">{item.age} years old</small> : null}</> : <>{item.subjects?.length ? item.subjects.join(', ') : 'Not set'}{item.hourly_rate != null ? <small className="table-secondary">₹{Number(item.hourly_rate).toLocaleString('en-IN')} / hour</small> : null}</>}</td>
                  <td><span className={`status-pill status-${item.status}`}>{item.status.replaceAll('_', ' ')}</span></td>
                  <td>{new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(item.created_at))}</td>
                  {canEdit && <td className="align-right"><div className="row-actions">
                    <button className="table-action" onClick={() => openEditDialog(item)}>Edit</button>
                    <button className={`table-action ${item.status === 'active' ? 'danger-action' : ''}`} onClick={() => void toggleStatus(item)}>{item.status === 'active' ? 'Suspend' : 'Activate'}</button>
                    <button className="table-action" disabled={item.status !== 'active'} title={item.status === 'active' ? `Send reset link to ${item.email}` : 'Only active accounts can receive a reset link.'} onClick={() => void sendPasswordReset(item)}>Reset password</button>
                  </div></td>}
                </tr>
              ))}
              {!loading && items.length === 0 && <tr><td colSpan={canEdit ? 7 : 5}><div className="table-empty"><UserRound size={26} /><strong>No {role} accounts found</strong><span>Adjust your search or add a new account.</span></div></td></tr>}
              {loading && <tr><td colSpan={canEdit ? 7 : 5}><div className="table-empty"><span className="spinner" /> Loading accounts…</div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      {dialogOpen && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialogOpen(false) }}>
          <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="create-user-title">
            <div className="dialog-heading"><div><p className="eyebrow">USER MANAGEMENT</p><h3 id="create-user-title">{editingPerson ? `Edit ${role}` : `Add ${role}`}</h3></div><button className="icon-button" aria-label="Close dialog" onClick={() => { setDialogOpen(false); setEditingPerson(null) }}><X size={19} /></button></div>
            <form className="dialog-form" onSubmit={submit}>
              <label>Full name<input required maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
              <label>Email address<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
              {!editingPerson && <label>Initial password<input required type="password" minLength={12} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /><small>Use at least 12 characters; share securely with the account holder.</small></label>}
              <label>Phone number<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
              {role === 'student' ? <>
                <label>Age<input type="number" min="1" max="120" value={form.age} onChange={(event) => setForm({ ...form, age: event.target.value })} /></label>
                <label>Grade / class<input value={form.grade} onChange={(event) => setForm({ ...form, grade: event.target.value })} /></label>
              </> : <>
                <label>Subjects <small>Separate subjects with commas.</small><input value={form.subjects} onChange={(event) => setForm({ ...form, subjects: event.target.value })} /></label>
                <label>Short bio <small>Shown to students on the teacher profile. Up to 600 characters.</small><textarea rows={3} maxLength={600} value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} /></label>
                <label>Hourly rate (INR, 0-4999)<input type="number" min="0" max="4999" step="0.01" value={form.hourlyRate} onChange={(event) => setForm({ ...form, hourlyRate: event.target.value })} /></label>
              </>}
              {error && <div role="alert" className="form-error">{error}</div>}
              <div className="dialog-actions"><button type="button" className="secondary-button" onClick={() => { setDialogOpen(false); setEditingPerson(null) }}>Cancel</button><button type="submit" className="primary-button" disabled={saving}>{saving ? 'Saving…' : editingPerson ? 'Save changes' : `Create ${role}`}</button></div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}
