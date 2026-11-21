import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { QRCodeSVG } from '../lib/qrcode'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import { getErrorMessage } from '../lib/api'
import EliteLoader, { waitForEliteLoader } from '../components/EliteLoader'
import { playUiSound } from '../lib/sound'

interface MfaState {
  challenge: string
  setup: boolean
  otpAuthUrl?: string
  accountName?: string
}

export function LoginPage() {
  const { user, login, confirmMfa, verifyMfa } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [mfa, setMfa] = useState<MfaState | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const manualSecret = (mfa?.otpAuthUrl?.match(/secret=([^&]+)/)?.[1] ?? '')

  if (user) {
    navigate('/dashboard', { replace: true })
    return null
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const startedAt = performance.now()
    setError('')
    setLoading(true)
    try {
      const result = await login(email, password)
      if (result.redirected) return
      if (result.challenge) {
        setMfa({
          challenge: result.challenge,
          setup: Boolean(result.requiresMfaSetup),
          otpAuthUrl: result.otpAuthUrl,
          accountName: result.accountName,
        })
      } else {
        await waitForEliteLoader(startedAt)
        navigate('/dashboard', { replace: true })
      }
    } catch (err) {
      setError(getErrorMessage(err))
      playUiSound('error')
    } finally {
      setLoading(false)
    }
  }

  const handleMfa = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!mfa) return
    const startedAt = performance.now()
    setError('')
    setLoading(true)
    try {
      if (mfa.setup) await confirmMfa(mfa.challenge, code)
      else await verifyMfa(mfa.challenge, code)
      await waitForEliteLoader(startedAt)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(getErrorMessage(err) + (mfa.setup ? ' If you already have an older entry, remove it from your authenticator app first.' : ''))
      playUiSound('error')
    } finally {
      setLoading(false)
    }
  }

  const title = mfa ? (mfa.setup ? 'Set up your authenticator' : 'Verify it’s you') : 'Welcome back'
  const subtitle = mfa
    ? 'Enter the six-digit code from your authenticator app.'
    : 'Sign in to manage your classes.'

  return (
    <div className="auth-page min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
      {loading && <EliteLoader label="Signing in" />}
      <div className="w-full max-w-md">
        <div className="auth-card bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <div className="auth-brand">
            <span className="auth-brand-name"><img className="auth-brand-logo" src="/elite-logo-md.png" alt="Elite" /><small>teacher portal</small></span>
          </div>
          <h1 className="auth-title">{title}</h1>
          <p className="auth-sub">{subtitle}</p>
          {params.get('registered') === '1' && (
            <div className="bg-green-50 text-green-800 text-sm px-4 py-3 rounded-lg border border-green-200 mb-5">
              Your teacher account was created. Sign in to continue.
            </div>
          )}
          {!mfa ? (
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoFocus
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
                  placeholder="teacher@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow pr-10"
                    placeholder="••••••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              {error && (
                <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-200">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
              >
                {loading ? <span className="spinner" /> : 'Sign In'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleMfa} className="space-y-5">
              {mfa.setup && mfa.otpAuthUrl && (
                <div className="flex flex-col items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="rounded-md bg-white p-2">
                    <QRCodeSVG value={mfa.otpAuthUrl} size={152} />
                  </div>
                  <p className="text-center text-xs text-slate-500">
                    Scan with your authenticator app for {mfa.accountName || email}
                  </p>
                  {manualSecret && (
                    <code className="mfa-secret">{manualSecret}</code>
                  )}
                </div>
              )}
              <div>
                <input
                  type="text"
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  autoFocus
                  maxLength={6}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg text-center text-2xl font-mono tracking-[0.5em] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
                  placeholder="000000"
                />
              </div>
              {error && (
                <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-200">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="w-full py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
              >
                {loading ? <span className="spinner" /> : mfa.setup ? 'Enable and sign in' : 'Verify'}
              </button>
              <button
                type="button"
                onClick={() => { setMfa(null); setCode(''); setError('') }}
                className="w-full py-2 text-sm text-slate-500 hover:text-slate-700"
              >
                ← Back to sign in
              </button>
            </form>
          )}
          <p className="mt-6 text-center text-sm text-slate-500">
            New to teaching?{' '}
            <Link to="/register" className="font-medium text-blue-600 hover:text-blue-700">
              Create a teacher account
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
