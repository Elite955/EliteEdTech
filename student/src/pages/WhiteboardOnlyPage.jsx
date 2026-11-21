import { Navigate, useParams } from 'react-router-dom'
import SharedWhiteboard from '../components/SharedWhiteboard'

export default function WhiteboardOnlyPage() {
  const { sessionId } = useParams()
  if (!sessionId) return <Navigate to="/" replace />

  return (
    <main className="whiteboard-standalone">
      <header>
        <h1>Class whiteboard</h1>
        <p>
          Keep this tab open while your teacher shares the board in Jitsi. The teacher controls screen sharing,
          and your browser only shares a tab after you approve it.
        </p>
      </header>
      <SharedWhiteboard sessionId={sessionId} />
    </main>
  )
}
