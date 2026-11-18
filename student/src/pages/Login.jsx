import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { playUiSound } from '../lib/sound'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '', rememberMe: false })
  const [mfa, setMfa] = useState(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const manualSecret = mfa?.otpAuthUrl?.match(/secret=([^&]+)/)?.[1] ?? ''

  const finish = (user) => {
    if (!user) return
    if (user.roleCode === 'teacher') {
      localStorage.removeItem('edtech_student_user')
      window.location.replace(import.meta.env.VITE_TEACHER_PORTAL_URL || 'http://localhost:5174')
      return
    }
    if (user.roleCode !== 'student') {
      localStorage.removeItem('edtech_student_user')
      window.location.replace(import.meta.env.VITE_ADMIN_PORTAL_URL || 'http://localhost:5173')
      return
    }
    login(user)
    playUiSound('success')
    navigate('/', { replace: true })
  }

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await api.post('/auth/login', { ...form, portal: 'student' })
      if (res.requiresMfaSetup || res.requiresMfa) {
        setMfa({
          challenge: res.challenge,
          setup: Boolean(res.requiresMfaSetup),
          otpAuthUrl: res.otpAuthUrl || null
        })
      } else {
        finish(res.user)
      }
    } catch (err) {
      setError(err.message || 'Something went wrong')
      playUiSound('error')
    } finally {
      setBusy(false)
    }
  }

  async function verify(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await api.post('/auth/mfa/confirm', { challenge: mfa.challenge, code })
      finish(res.user)
    } catch (err) {
      const hint = mfa.setup
        ? ' If it keeps failing, delete the old EdTech Platform entry in your authenticator app and scan this new QR code.'
        : ''
      setError((err.message || 'Something went wrong') + hint)
      playUiSound('error')
    } finally {
      setBusy(false)
    }
  }

  async function reverify(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await api.post('/auth/mfa/verify', { challenge: mfa.challenge, code })
      finish(res.user)
    } catch (err) {
      setError(err.message || 'Something went wrong')
      playUiSound('error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card form-card">
        <h1>Sign in</h1>
        <p className="page-sub">Student portal - EDTECH one-to-one tutoring</p>

        {error && <div className="alert error">{error}</div>}

        {!mfa ? (
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                required
                minLength={12}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <label className="checkline" htmlFor="rememberMe">
              <input
                id="rememberMe"
                type="checkbox"
                checked={form.rememberMe}
                onChange={(e) => setForm({ ...form, rememberMe: e.target.checked })}
              />
              Remember me on this device
            </label>
            <button className="btn" disabled={busy}>
              {busy ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        ) : (
          <form onSubmit={mfa.setup ? verify : reverify}>
            {mfa.setup && (
              <div className="alert info">
                <p style={{ marginBottom: 8 }}>
                  First sign-in: enroll your authenticator app by scanning this QR code.
                </p>
                {mfa.otpAuthUrl && (
                  <div style={{ background: '#fff', padding: 8, borderRadius: 8, width: 180 }}>
                    <QRCodeSVG value={mfa.otpAuthUrl} size={164} level="M" />
                  </div>
                )}
                {mfa.otpAuthUrl && manualSecret && (
                  <div style={{ marginTop: 8 }}>
                    <p style={{ fontSize: 12, marginBottom: 4 }}>
                      Or in OneAuth choose &quot;Or enter code manually&quot; and paste this secret:
                    </p>
                    <div
                      style={{
                        background: '#fff',
                        color: '#111827',
                        padding: '6px 10px',
                        borderRadius: 8,
                        fontFamily: 'monospace',
                        fontSize: 14,
                        wordBreak: 'break-all'
                      }}
                    >
                      {manualSecret}
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="field">
              <label htmlFor="code">Authenticator code</label>
              <input
                id="code"
                inputMode="numeric"
                placeholder="6-digit code"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <button className="btn" disabled={busy}>
              {busy ? 'Verifying...' : 'Verify & continue'}
            </button>
          </form>
        )}

        <p style={{ marginTop: 16, fontSize: 14 }}>
          New here? <Link className="link" to="/register">Create a student account</Link>
        </p>
      </div>
    </div>
  )
}
