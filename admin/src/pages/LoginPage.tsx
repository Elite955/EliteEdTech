import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { ArrowRight, Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react'
import type { AuthenticatedUser, Permission } from '../auth/context'
import { homePathForUser } from '../auth/roleRoutes'
import { useAuth } from '../auth/useAuth'
import { api, getErrorMessage } from '../lib/api'

type LoginReply = {
  user?: AuthenticatedUser
  permissions?: Permission[]
  requiresMfa?: boolean
  requiresMfaSetup?: boolean
  challenge?: string
  otpAuthUrl?: string
}

export function LoginPage() {
  const { user, setSession } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [challenge, setChallenge] = useState('')
  const [otpAuthUrl, setOtpAuthUrl] = useState('')
  const [stage, setStage] = useState<'credentials' | 'mfa' | 'enroll'>('credentials')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [resetMessage, setResetMessage] = useState('')

  if (user) return <Navigate to={homePathForUser(user)} replace />

  async function completeSignIn(reply: LoginReply) {
    if (!reply.user || !reply.permissions) throw new Error('The server returned an incomplete sign-in response.')
    setSession(reply.user, reply.permissions)
    navigate(homePathForUser(reply.user), { replace: true })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (stage === 'credentials') {
        const reply = await api<LoginReply>('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password, rememberMe }),
        })
        if (reply.requiresMfaSetup && reply.challenge && reply.otpAuthUrl) {
          setChallenge(reply.challenge)
          setOtpAuthUrl(reply.otpAuthUrl)
          setStage('enroll')
        } else if (reply.requiresMfa && reply.challenge) {
          setChallenge(reply.challenge)
          setStage('mfa')
        } else {
          await completeSignIn(reply)
        }
      } else {
        const path = stage === 'enroll' ? '/auth/mfa/confirm' : '/auth/mfa/verify'
        const reply = await api<LoginReply>(path, {
          method: 'POST',
          body: JSON.stringify({ challenge, code }),
        })
        await completeSignIn(reply)
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  async function requestPasswordReset() {
    setError('')
    setResetMessage('')
    if (!email) {
      setError('Enter your account email first.')
      return
    }
    setBusy(true)
    try {
      const reply = await api<{ message: string }>('/auth/password-reset/request', {
        method: 'POST',
        body: JSON.stringify({ email }),
      })
      setResetMessage(reply.message)
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  function restartSignIn() {
    setStage('credentials')
    setChallenge('')
    setOtpAuthUrl('')
    setCode('')
    setError('')
  }

  return (
    <main className="login-page">
      <section className="login-brand">
        <div className="brand-logo"><span>e</span></div>
        <div className="brand-copy">
          <span className="eyebrow">EDTECH PLATFORM</span>
          <h1>Learning, managed<br />with purpose.</h1>
          <p>One secure workspace for the people and systems behind every great class.</p>
        </div>
        <div className="brand-footer"><ShieldCheck size={17} /> One secure sign-in for every account</div>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <div className="mobile-brand"><div className="brand-logo"><span>e</span></div><b>EdTech Platform</b></div>
          <span className="eyebrow">ACCOUNT SIGN-IN</span>
          <h2>{stage === 'credentials' ? 'Welcome back' : stage === 'enroll' ? 'Set up your authenticator' : 'Verify it’s you'}</h2>
          <p className="login-intro">
            {stage === 'credentials' ? 'Sign in to continue to your learning workspace.' : stage === 'enroll' ? 'Secure your administrator account with an authenticator app.' : 'Enter the six-digit code from your authenticator app.'}
          </p>

          {stage === 'enroll' && (
            <div className="mfa-setup">
              <QRCodeSVG value={otpAuthUrl} size={160} level="M" />
              <p>Scan the QR code with your authenticator app. Codes refresh every 30 seconds.</p>
              <details><summary>Can’t scan the code?</summary><code>{otpAuthUrl}</code></details>
            </div>
          )}

          <form onSubmit={handleSubmit} className="login-form">
            {stage === 'credentials' ? (
              <>
                <label htmlFor="account-email">Email address</label>
                <input id="account-email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" />
                <label htmlFor="account-password">Password</label>
                <div className="password-field">
                  <input id="account-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" />
                  <button type="button" className="icon-button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)}>
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
                <div className="login-options">
                  <label className="checkbox-label"><input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} /> Remember me</label>
                  <button type="button" className="reset-link" onClick={() => void requestPasswordReset()} disabled={busy}>Forgot password?</button>
                </div>
              </>
            ) : (
              <>
                <label htmlFor="mfa-code">6-digit authenticator code</label>
                <div className="code-field"><KeyRound size={18} /><input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" /></div>
              </>
            )}
            {error && <div role="alert" className="form-error">{error}</div>}
            {resetMessage && <div role="status" className="form-success">{resetMessage}</div>}
            <button type="submit" className="primary-button login-submit" disabled={busy}>
              {busy ? <span className="spinner spinner-light" /> : <>{stage === 'credentials' ? 'Sign in securely' : stage === 'enroll' ? 'Verify and continue' : 'Verify code'} <ArrowRight size={17} /></>}
            </button>
            {stage !== 'credentials' && <button type="button" className="text-button" onClick={restartSignIn}>Back to sign in</button>}
          </form>
          <div className="login-security"><ShieldCheck size={15} /> Encrypted session · secure access</div>
        </div>
        <p className="login-legal">Students, teachers, and administrators use the same sign-in.</p>
      </section>
    </main>
  )
}
