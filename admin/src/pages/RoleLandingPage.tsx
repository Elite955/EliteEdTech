import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, ShieldCheck } from 'lucide-react'
import { useAuth } from '../auth/useAuth'

export function RoleLandingPage({ role }: { role: 'student' | 'teacher' }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')

  async function handleSignOut() {
    setError('')
    try {
      await logout()
      navigate('/sign-in', { replace: true })
    } catch {
      setError('Sign out could not be completed. Please try again.')
    }
  }

  const roleLabel = role === 'student' ? 'Student' : 'Teacher'
  const workspace = role === 'student' ? 'student learning' : 'teacher teaching'

  return (
    <main className="role-portal-page">
      <section className="role-portal-card">
        <div className="brand-logo"><span>e</span></div>
        <p className="eyebrow">{roleLabel} workspace</p>
        <h1>Welcome, {user?.name}</h1>
        <p className="role-portal-copy">
          You’re signed in as <strong>{user?.email}</strong>.
        </p>
        <div className="alert alert-info">
          The {workspace} portal is not available yet. Your account is authenticated; please check back when your workspace is ready.
        </div>
        {error && <div role="alert" className="form-error">{error}</div>}
        <button type="button" className="primary-button role-portal-signout" onClick={() => void handleSignOut()}>
          <LogOut size={16} /> Sign out
        </button>
        <div className="login-security"><ShieldCheck size={15} /> Secure account session</div>
      </section>
    </main>
  )
}
