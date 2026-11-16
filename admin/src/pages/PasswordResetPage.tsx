import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { api, getErrorMessage } from '../lib/api'

export function PasswordResetPage() {
  const [search] = useSearchParams()
  const token = search.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [complete, setComplete] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (password !== confirmation) {
      setError('The passwords do not match.')
      return
    }
    setBusy(true)
    try {
      await api('/auth/password-reset/confirm', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      })
      setComplete(true)
    } catch (requestError) { setError(getErrorMessage(requestError)) }
    finally { setBusy(false) }
  }

  return (
    <main className="reset-page">
      <div className="reset-card">
        <div className="brand-logo"><span>e</span></div>
        <p className="eyebrow">ACCOUNT SECURITY</p>
        <h1>{complete ? 'Password updated' : 'Reset your password'}</h1>
        {complete ? (
          <>
            <p className="reset-copy">Your password has been updated and existing sessions have been revoked. Sign in again with your new password.</p>
            <Link to="/sign-in" className="primary-button reset-submit"><ArrowLeft size={16} /> Return to sign in</Link>
          </>
        ) : !token ? (
          <>
            <p className="reset-copy">This reset link is incomplete. Request a fresh link from the sign-in screen.</p>
            <Link to="/sign-in" className="primary-button reset-submit"><ArrowLeft size={16} /> Return to sign in</Link>
          </>
        ) : (
          <>
            <p className="reset-copy">Choose a new password with at least 12 characters.</p>
            <form className="login-form reset-form" onSubmit={submit}>
              <label htmlFor="new-password">New password</label>
              <input id="new-password" type="password" autoComplete="new-password" minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} />
              <label htmlFor="confirm-password">Confirm new password</label>
              <input id="confirm-password" type="password" autoComplete="new-password" minLength={12} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
              {error && <div role="alert" className="form-error">{error}</div>}
              <button type="submit" className="primary-button reset-submit" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</button>
            </form>
          </>
        )}
        <div className="login-security"><ShieldCheck size={15} /> Reset links expire after 30 minutes and work once.</div>
      </div>
    </main>
  )
}
