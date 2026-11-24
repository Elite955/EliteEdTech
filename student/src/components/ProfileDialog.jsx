import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { Icon } from './icons'
import { playUiSound } from '../lib/sound'

function formFromUser(user) {
  return {
    name: user?.name || '',
    phone: user?.phone || '',
    age: user?.age == null ? '' : String(user.age),
    grade: user?.grade || ''
  }
}

export default function ProfileDialog({ onClose, returnFocusRef }) {
  const { user, updateUser } = useAuth()
  const [form, setForm] = useState(() => formFromUser(user))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const dialogRef = useRef(null)
  const nameRef = useRef(null)
  const previousFocus = useRef(null)

  useEffect(() => {
    previousFocus.current = returnFocusRef?.current ?? document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    let active = true
    api
      .get('/profile')
      .then((res) => {
        if (!active || !res.profile) return
        const p = res.profile
        setForm({
          name: p.name || '',
          phone: p.phone || '',
          age: p.age == null ? '' : String(p.age),
          grade: p.grade || ''
        })
        updateUser({ name: p.name, phone: p.phone ?? null, age: p.age ?? null, grade: p.grade ?? null })
      })
      .catch((e) => active && setErr(e.message))
      .finally(() => active && setLoading(false))

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      active = false
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
      previousFocus.current?.focus?.()
    }
  }, [])

  useEffect(() => {
    if (!loading) nameRef.current?.focus()
  }, [loading])

  function closeDialog() {
    if (saving) return
    onClose()
  }

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    setErr('')
    setNote('')
    try {
      const age = form.age.trim()
      const res = await api.patch('/profile', {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        age: age === '' ? null : Number(age),
        grade: form.grade.trim() || null
      })
      const p = res.profile
      setForm({
        name: p.name || '',
        phone: p.phone || '',
        age: p.age == null ? '' : String(p.age),
        grade: p.grade || ''
      })
      updateUser({ name: p.name, phone: p.phone ?? null, age: p.age ?? null, grade: p.grade ?? null })
      setNote('Profile updated.')
      playUiSound('success')
    } catch (e) {
      setErr(e.message)
      playUiSound('error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="profile-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeDialog()
      }}
    >
      <div
        className="profile-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-dialog-title"
        aria-describedby="profile-dialog-description"
        ref={dialogRef}
      >
        <div className="profile-dialog-heading">
          <div>
            <p className="profile-dialog-eyebrow">Student account</p>
            <h2 id="profile-dialog-title">Edit profile</h2>
            <p id="profile-dialog-description">Keep your contact details current so teachers can reach you about classes.</p>
          </div>
          <button type="button" className="icon-button" onClick={closeDialog} aria-label="Close profile dialog">
            <Icon name="close" size={17} />
          </button>
        </div>

        {err && <div className="alert error">{err}</div>}
        {note && <div className="alert success">{note}</div>}

        {loading ? (
          <div className="profile-dialog-loading">
            <span className="profile-dialog-spinner" aria-hidden="true" />
            Loading profile...
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="profile-grid">
              <div className="field">
                <label htmlFor="dialog-profile-name">Full name</label>
                <input
                  id="dialog-profile-name"
                  ref={nameRef}
                  value={form.name}
                  onChange={update('name')}
                  minLength={2}
                  maxLength={120}
                  required
                  autoComplete="name"
                />
              </div>
              <div className="field">
                <label htmlFor="dialog-profile-phone">Phone</label>
                <input
                  id="dialog-profile-phone"
                  value={form.phone}
                  onChange={update('phone')}
                  maxLength={20}
                  placeholder="+91 98765 43210"
                  autoComplete="tel"
                />
                <p className="field-hint">Used for account verification and support.</p>
              </div>
              <div className="field">
                <label htmlFor="dialog-profile-age">Age</label>
                <input
                  id="dialog-profile-age"
                  type="number"
                  value={form.age}
                  onChange={update('age')}
                  min={5}
                  max={100}
                  placeholder="e.g. 14"
                />
              </div>
              <div className="field">
                <label htmlFor="dialog-profile-grade">Grade</label>
                <input
                  id="dialog-profile-grade"
                  value={form.grade}
                  onChange={update('grade')}
                  maxLength={80}
                  placeholder="e.g. Class 9"
                />
              </div>
            </div>

            <div className="profile-readonly">
              <span>Email</span>
              <strong>{user?.email}</strong>
              <small>Contact support if you need to change the email on your account.</small>
            </div>

            <div className="profile-dialog-actions">
              <button type="button" className="btn ghost" onClick={closeDialog} disabled={saving}>Close</button>
              <button className="btn" type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
