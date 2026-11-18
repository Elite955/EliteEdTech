import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { playUiSound } from '../lib/sound'

const teacherPortalUrl =
  import.meta.env.VITE_TEACHER_PORTAL_URL ||
  `${window.location.protocol}//${window.location.hostname}:5174`

export default function Register() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    age: '',
    grade: ''
  })
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.post('/auth/register', {
        role: 'student',
        name: form.name,
        email: form.email,
        phone: form.phone || undefined,
        password: form.password,
        age: Number(form.age),
        grade: form.grade || undefined
      })
      setDone(true)
      playUiSound('success')
    } catch (err) {
      setError(err.message || 'Registration failed')
      playUiSound('error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card form-card">
        <h1>Create student account</h1>
        <p className="page-sub">Student portal - EDTECH one-to-one tutoring</p>

        {error && <div className="alert error">{error}</div>}
        {done && (
          <div className="alert success">
            Account created. You can now <Link className="link" to="/login">sign in</Link>.
          </div>
        )}

        {!done && (
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="name">Full name</label>
              <input id="name" required value={form.name} onChange={set('name')} />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" required value={form.email} onChange={set('email')} />
            </div>
            <div className="field">
              <label htmlFor="phone">Phone (WhatsApp, optional)</label>
              <input id="phone" value={form.phone} onChange={set('phone')} />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                required
                minLength={12}
                value={form.password}
                onChange={set('password')}
              />
              <p className="field-hint">At least 12 characters.</p>
            </div>
            <div className="field">
              <label htmlFor="age">Age</label>
              <input id="age" type="number" min={5} max={100} required value={form.age} onChange={set('age')} />
            </div>
            <div className="field">
              <label htmlFor="grade">Class / grade</label>
              <input id="grade" value={form.grade} onChange={set('grade')} />
            </div>

            <button className="btn" disabled={busy}>
              {busy ? 'Creating...' : 'Register'}
            </button>
          </form>
        )}

        <p style={{ marginTop: 16, fontSize: 14 }}>
          Already registered? <Link className="link" to="/login">Sign in</Link>
        </p>
        <p style={{ marginTop: 8, fontSize: 14 }}>
          Teaching with us? <a className="link" href={teacherPortalUrl}>Use the teacher portal</a> with the account your administrator created.
        </p>
      </div>
    </div>
  )
}
