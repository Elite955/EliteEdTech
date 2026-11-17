import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'

export default function Register() {
  const [role, setRole] = useState('student')
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    age: '',
    grade: '',
    hourly_rate: '',
    subjects: '',
    bio: ''
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
      const base = {
        role,
        name: form.name,
        email: form.email,
        phone: form.phone || undefined,
        password: form.password
      }
      if (role === 'teacher') {
        await api.post('/auth/register', {
          ...base,
          hourly_rate: Number(form.hourly_rate),
          subjects: form.subjects.split(',').map((s) => s.trim()).filter(Boolean),
          bio: form.bio || undefined
        })
      } else {
        await api.post('/auth/register', {
          ...base,
          age: Number(form.age),
          grade: form.grade || undefined
        })
      }
      setDone(true)
    } catch (err) {
      setError(err.message || 'Registration failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card form-card">
        <h1>Create account</h1>
        <p className="page-sub">Register as a {role}</p>

        {error && <div className="alert error">{error}</div>}
        {done && (
          <div className="alert success">
            Account created. You can now <Link className="link" to="/login">sign in</Link>.
          </div>
        )}

        {!done && (
          <form onSubmit={submit}>
            <div className="field">
              <label>I am a</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {['student', 'teacher'].map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={`chip ${role === r ? 'sel' : ''}`}
                    style={{ cursor: 'pointer', textTransform: 'capitalize' }}
                    onClick={() => setRole(r)}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
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

            {role === 'student' ? (
              <>
                <div className="field">
                  <label htmlFor="age">Age</label>
                  <input id="age" type="number" min={5} max={100} required value={form.age} onChange={set('age')} />
                </div>
                <div className="field">
                  <label htmlFor="grade">Class / grade</label>
                  <input id="grade" value={form.grade} onChange={set('grade')} />
                </div>
              </>
            ) : (
              <>
                <div className="field">
                  <label htmlFor="hourly_rate">Hourly rate (₹ per hour)</label>
                  <input
                    id="hourly_rate"
                    type="number"
                    min={1}
                    required
                    value={form.hourly_rate}
                    onChange={set('hourly_rate')}
                  />
                </div>
                <div className="field">
                  <label htmlFor="subjects">Subjects (comma-separated)</label>
                  <input
                    id="subjects"
                    required
                    placeholder="Mathematics, Science"
                    value={form.subjects}
                    onChange={set('subjects')}
                  />
                </div>
                <div className="field">
                  <label htmlFor="bio">Short bio (optional)</label>
                  <input id="bio" value={form.bio} onChange={set('bio')} />
                </div>
              </>
            )}

            <button className="btn" disabled={busy}>
              {busy ? 'Creating…' : 'Register'}
            </button>
          </form>
        )}

        <p style={{ marginTop: 16, fontSize: 14 }}>
          Already registered? <Link className="link" to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
