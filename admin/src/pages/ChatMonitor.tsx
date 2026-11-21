import { useEffect, useRef, useState } from 'react'
import { api, getErrorMessage } from '../lib/api'
import { connectSocket, disconnectSocket } from '../lib/socket'

interface ChatMessage {
  id: string
  sender_id: string
  sender_name: string
  sender_role: 'student' | 'teacher' | 'admin'
  sender_role_label?: string
  content: string
  room: string
  status: 'visible' | 'hidden' | 'deleted'
  reported: boolean
  created_at: string
  age?: number | null
  censored?: boolean
}

export function ChatMonitor() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const socketRef = useRef<ReturnType<typeof connectSocket> | null>(null)

  useEffect(() => {
    let active = true
    api<{ messages: ChatMessage[] }>('/admin/chat/messages')
      .then((data) => {
        if (active) setMessages(data.messages || [])
      })
      .catch((err) => {
        if (active) setError(getErrorMessage(err))
      })

    const socket = connectSocket()
    socketRef.current = socket
    const onConnect = () => { setConnected(true); setError('') }
    const onDisconnect = () => setConnected(false)
    const onError = (event: { message?: string }) => setError(event?.message || 'Chat server unreachable.')
    const onMessage = (message: ChatMessage) => {
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [message, ...current])
    }

    if (socket.connected) onConnect()
    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('connect_error', onError)
    socket.on('chat:new', onMessage)

    return () => {
      active = false
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('connect_error', onError)
      socket.off('chat:new', onMessage)
      disconnectSocket()
    }
  }, [])

  async function moderate(message: ChatMessage, status: 'hidden' | 'deleted') {
    setBusyId(message.id)
    setError('')
    try {
      await api(`/admin/modules/chat_moderation/${message.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      setMessages((current) => current.map((item) => item.id === message.id ? { ...item, status } : item))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <div className="page-intro">
        <div>
          <span className="eyebrow">Live monitoring</span>
          <h2>Chat moderation</h2>
          <p>Recent and incoming global chat messages, updated in real time.</p>
        </div>
        <span className={`date-chip${connected ? '' : ' status-suspended'}`}>
          {connected ? 'Live' : 'Reconnecting…'}
        </span>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Sender</th>
              <th>Role</th>
              <th>Message</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {messages.length === 0 && (
              <tr><td colSpan={6}><div className="table-empty"><strong>No messages yet.</strong><span>Incoming messages appear here immediately.</span></div></td></tr>
            )}
            {messages.map((message) => {
              const roleLabel = message.sender_role_label ||
                (message.sender_role === 'teacher' ? 'Teacher' : message.sender_role === 'admin' ? 'Admin' : 'Student')
              return (
                <tr key={message.id}>
                  <td>{new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                  <td><strong>{message.sender_name || roleLabel}</strong></td>
                  <td><span className="chat-role">{roleLabel}</span></td>
                  <td>
                    {message.content}
                    {message.censored && <div className="table-secondary">Censored for age {message.age}</div>}
                    {message.reported && <div className="table-secondary">Reported</div>}
                  </td>
                  <td><span className={`status-pill status-${message.status}`}>{message.status}</span></td>
                  <td>
                    <button
                      type="button"
                      className="table-action"
                      disabled={busyId === message.id || message.status === 'hidden'}
                      onClick={() => moderate(message, 'hidden')}
                    >
                      Hide
                    </button>
                    {' '}
                    <button
                      type="button"
                      className="table-action danger-action"
                      disabled={busyId === message.id || message.status === 'deleted'}
                      onClick={() => moderate(message, 'deleted')}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
