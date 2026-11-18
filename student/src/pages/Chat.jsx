import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import { connectSocket } from '../api/socket'
import { useAuth } from '../context/AuthContext'

export default function Chat() {
  const { user, isCensored } = useAuth()
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [connected, setConnected] = useState(false)
  const [err, setErr] = useState('')
  const [loaded, setLoaded] = useState(false)
  const boxRef = useRef(null)
  const socketRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    api
      .get('/chat/messages?room=global')
      .then((res) => {
        if (!cancelled) {
          setMessages(res.messages || [])
          setLoaded(true)
        }
      })
      .catch(() => setLoaded(true))

    const socket = connectSocket()
    socketRef.current = socket

    const join = () => {
      setConnected(true)
      setErr('')
    }
    if (socket.connected) join()
    socket.on('connect', join)
    socket.on('disconnect', () => setConnected(false))
    socket.on('connect_error', (e) => setErr(`Chat server unreachable: ${e?.message || 'connection failed'}`))
    socket.on('chat:error', (e) => setErr(e?.message || 'Chat error'))
    socket.on('chat:message:new', (m) => setMessages((prev) => [...prev, m]))

    return () => {
      cancelled = true
      socket.off()
    }
  }, [])

  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight
  }, [messages])

  function send(e) {
    e.preventDefault()
    const t = text.trim()
    if (!t || !socketRef.current?.connected) return
    socketRef.current.emit('chat:message', { room: 'global', content: t })
    setText('')
  }

  return (
    <div>
      <div className="spread" style={{ marginBottom: 12 }}>
        <div>
          <h1>Global chat</h1>
          <p className="page-sub" style={{ marginBottom: 0 }}>
            The student community room — live over the platform's pub-sub service.
          </p>
        </div>
        <span className={`badge`} style={{ background: connected ? '#047857' : '#475569' }}>
          {connected ? 'connected' : 'connecting…'}
        </span>
      </div>

      {isCensored && (
        <div className="alert warn" style={{ marginBottom: 12 }}>
          Censored mode is active for your age group (10–12): messages are content-filtered before
          they reach this room.
        </div>
      )}
      {err && <div className="alert error">{err}</div>}

      <div className="chat-wrap">
        <div className="chat-msgs" ref={boxRef}>
          {loaded && messages.length === 0 && <div className="empty">No messages yet — say hello.</div>}
          {messages.map((m, i) => {
            const mine = String(m.sender_id) === String(user?.id)
            return (
              <div key={m.id ?? i} className={`msg ${mine ? 'mine' : ''}`}>
                <div className="who">
                  {m.sender_name || m.sender?.name || 'Student'}{mine ? ' (you)' : ''}
                </div>
                {m.content}
                {m.created_at && (
                  <div className="who" style={{ marginTop: 4, textAlign: mine ? 'right' : 'left' }}>
                    {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <form className="chat-input" onSubmit={send}>
          <input
            placeholder="Type a message…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
          />
          <button className="btn small">Send</button>
        </form>
      </div>
    </div>
  )
}
