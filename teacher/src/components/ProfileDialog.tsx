import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react'
import { BookOpen, DollarSign, Save, User, X } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import { api, getErrorMessage } from '../lib/api'
import { playUiSound } from '../lib/sound'
import type { TeacherProfile } from '../lib/types'

interface ProfileDialogProps {
  onClose: () => void
  returnFocusRef?: RefObject<HTMLButtonElement | null>
}

export function ProfileDialog({ onClose, returnFocusRef }: ProfileDialogProps) {
  const { updateUser } = useAuth()
  const [profile, setProfile] = useState<TeacherProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [bio, setBio] = useState('')
  const [subjects, setSubjects] = useState('')
  const [hourlyRate, setHourlyRate] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    previousFocus.current = returnFocusRef?.current ?? (document.activeElement as HTMLElement | null)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    let active = true
    async function load() {
      try {
        const data = await api<{ profile: TeacherProfile }>('/teacher/profile')
        if (!active) return
        setProfile(data.profile)
        setName(data.profile.name ?? '')
        setPhone(data.profile.phone ?? '')
        setBio(data.profile.bio ?? '')
        setSubjects((data.profile.subjects ?? []).join(', '))
        setHourlyRate(data.profile.hourly_rate?.toString() ?? '')
      } catch (err) {
        if (active) setError(getErrorMessage(err))
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()

    function handleKeyDown(event: KeyboardEvent) {
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
      previousFocus.current?.focus()
    }
  }, [])

  useEffect(() => {
    if (!loading) nameRef.current?.focus()
  }, [loading])

  function closeDialog() {
    if (saving) return
    onClose()
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault()
    setError('')
    setSuccess('')
    setSaving(true)
    try {
      const payload = {
        name: name.trim(),
        phone: phone.trim() || null,
        bio: bio.trim() || null,
        subjects: subjects.split(',').map((subject) => subject.trim()).filter(Boolean),
        hourlyRate: hourlyRate ? Number(hourlyRate) : null,
      }
      const data = await api<{ profile: TeacherProfile }>('/teacher/profile', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
      if (data.profile?.name) updateUser({ name: data.profile.name })
      if (data.profile) setProfile(data.profile)
      setSuccess('Profile updated.')
      playUiSound('success')
    } catch (err) {
      setError(getErrorMessage(err))
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
      >
        <div className="profile-dialog-heading">
          <div>
            <p className="profile-dialog-eyebrow">Teacher account</p>
            <h2 id="profile-dialog-title">Edit profile</h2>
            <p id="profile-dialog-description">Update the teaching details students see when they book a class.</p>
          </div>
          <button type="button" className="icon-button" onClick={closeDialog} aria-label="Close profile dialog">
            <X size={17} />
          </button>
        </div>

        {error && <div className="profile-dialog-alert error">{error}</div>}
        {success && <div className="profile-dialog-alert success">{success}</div>}

        {loading ? (
          <div className="profile-dialog-loading">
            <span className="spinner" aria-hidden="true" />
            Loading profile...
          </div>
        ) : (
          <form className="profile-dialog-form" onSubmit={handleSave}>
            {!profile?.approved && (
              <div className="profile-dialog-alert warn">
                Your profile is awaiting admin approval. You can still update these details.
              </div>
            )}

            <div className="profile-dialog-section">
              <h3><User size={16} /> Basic information</h3>
              <div className="profile-dialog-grid">
                <label className="profile-dialog-field">
                  <span>Full name</span>
                  <input
                    ref={nameRef}
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    minLength={2}
                    maxLength={80}
                    required
                    autoComplete="name"
                  />
                </label>
                <label className="profile-dialog-field">
                  <span>Phone</span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    maxLength={20}
                    placeholder="+91 98765 43210"
                    autoComplete="tel"
                  />
                  <small>Used for account verification and support.</small>
                </label>
              </div>
              <label className="profile-dialog-field">
                <span>Email</span>
                <input type="email" value={profile?.email ?? ''} disabled />
                <small>Email changes are handled by support.</small>
              </label>
            </div>

            <div className="profile-dialog-section">
              <h3><BookOpen size={16} /> Teaching details</h3>
              <label className="profile-dialog-field">
                <span>Subjects</span>
                <input
                  type="text"
                  value={subjects}
                  onChange={(event) => setSubjects(event.target.value)}
                  maxLength={320}
                  placeholder="Math, Physics, Chemistry"
                />
                <small>Separate multiple subjects with commas.</small>
              </label>
              <label className="profile-dialog-field">
                <span>Bio</span>
                <textarea
                  value={bio}
                  onChange={(event) => setBio(event.target.value)}
                  rows={4}
                  maxLength={600}
                  placeholder="Share your teaching experience, qualifications, and style."
                />
              </label>
            </div>

            <div className="profile-dialog-section">
              <h3><DollarSign size={16} /> Hourly rate</h3>
              <label className="profile-dialog-field profile-dialog-rate">
                <span>Rate per hour</span>
                <input
                  type="number"
                  value={hourlyRate}
                  onChange={(event) => setHourlyRate(event.target.value)}
                  min={0}
                  max={100000}
                  step={50}
                  placeholder="500"
                />
                <small>Students see this rate. Booking amount = hours x rate.</small>
              </label>
            </div>

            <div className="profile-dialog-actions">
              <button type="button" className="profile-dialog-secondary" onClick={closeDialog} disabled={saving}>Close</button>
              <button type="submit" className="profile-dialog-primary" disabled={saving}>
                {saving ? <span className="spinner" /> : <Save size={15} />}
                {saving ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
