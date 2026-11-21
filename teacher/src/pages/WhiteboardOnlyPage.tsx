import { Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { PageLoader } from '../components/PageLoader'
import { SharedWhiteboard } from '../components/SharedWhiteboard'

export function WhiteboardOnlyPage() {
  const { sessionId } = useParams()
  const { user, loading } = useAuth()

  if (loading) return <PageLoader label="Checking your session…" fullScreen />
  if (!user) return <Navigate to="/sign-in" replace />
  if (user.roleCode !== 'teacher') return <Navigate to="/sign-in" replace />
  if (!sessionId) return <Navigate to="/sessions" replace />

  return (
    <main className="mx-auto min-h-screen max-w-6xl space-y-4 bg-slate-50 p-4 sm:p-8">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Class whiteboard</h1>
        <p className="mt-1 text-sm text-slate-600">
          To show this board in Jitsi, switch to the meeting and choose its Share screen control, then select this tab.
          Your browser will ask you to approve sharing.
        </p>
      </header>
      <SharedWhiteboard sessionId={sessionId} />
    </main>
  )
}
