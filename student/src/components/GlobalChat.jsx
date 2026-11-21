import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import { connectSocket } from '../api/socket'
import { useAuth } from '../context/AuthContext'
import { Icon } from './icons'

export default function GlobalChat({ onClose }) {
  const { user, isCensored } = useAuth()
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [connected, setConnected] = useState(false)
  const [err, setErr] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [closing, setClosing] = useState(false)
  const boxRef = useRef(null)
  const inputRef = useRef(null)
  const socketRef = useRef(null)
  const closingRef = useRef(false)
  const closeTimerRef = useRef(null)

  function requestClose() {
    if (closingRef.current) return
    closingRef.current = true
    setClosing(true)
    closeTimerRef.current = window.setTimeout(onClose, 180)
  }

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    }
  }, [])

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
      .catch(() => {
        if (!cancelled) {
          setErr('Could not load recent messages.')
          setLoaded(true)
        }
      })

    const socket = connectSocket()
    socketRef.current = socket

    const join = () => {
      setConnected(true)
      setErr('')
    }
    const leave = () => setConnected(false)
    const fail = (event) => setErr(`Chat server unreachable: ${event?.message || 'connection failed'}`)
    const chatError = (event) => setErr(event?.message || 'Chat error')
    const receive = (message) => setMessages((prev) => [...prev, message])

    if (socket.connected) join()
    socket.on('connect', join)
    socket.on('disconnect', leave)
    socket.on('connect_error', fail)
    socket.on('chat:error', chatError)
    socket.on('chat:message:new', receive)

    return () => {
      cancelled = true
      socket.off('connect', join)
      socket.off('disconnect', leave)
      socket.off('connect_error', fail)
      socket.off('chat:error', chatError)
      socket.off('chat:message:new', receive)
    }
  }, [])

  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight
  }, [messages])

  useEffect(() => {
    inputRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') requestClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  function send(event) {
    event.preventDefault()
    const content = text.trim()
    if (!content || !socketRef.current?.connected) return
    socketRef.current.emit('chat:message', { room: 'global', content })
    setText('')
  }

  return (
    <>
      <button
        type="button"
        className={`chat-backdrop${closing ? ' is-closing' : ''}`}
        aria-label="Close global chat"
        data-ui-sound="close"
        onClick={requestClose}
      />
      <aside
        className={`chat-drawer${closing ? ' is-closing' : ''}`}
        id="global-chat"
        role="dialog"
        aria-modal="true"
        aria-label="Global chat"
      >
        <header className="chat-drawer-head">
          <div>
            <h2>Global chat</h2>
            <p>Student community room</p>
          </div>
          <div className="chat-drawer-tools">
            <button
              type="button"
              className="icon-button chat-close"
              aria-label="Close global chat"
              data-ui-sound="close"
              onClick={requestClose}
            >
              <Icon name="close" size={19} />
            </button>
          </div>
        </header>

        {isCensored && (
          <div className="alert warn chat-note">
            Censored mode is active for your age group (10–12): messages are content-filtered.
          </div>
        )}
        {err && <div className="alert error chat-note">{err}</div>}

        <div className="chat-msgs" ref={boxRef} role="log" aria-live="polite">
          {!loaded && <div className="empty">Opening the room…</div>}
          {loaded && messages.length === 0 && <div className="empty">No messages yet — say hello.</div>}
          {messages.map((message, index) => {
            const mine = String(message.sender_id) === String(user?.id)
            const roleLabel = message.sender_role_label || (message.sender_role === 'teacher' ? 'Teacher' : 'Student')
            return (
              <div key={message.id ?? index} className={`msg${mine ? ' mine' : ''}`}>
                <div className="who">
                  {message.sender_name || message.sender?.name || roleLabel}{mine ? ' (you)' : ''}
                  {roleLabel && <span className="chat-role">{roleLabel}</span>}
                </div>
                {message.content}
                {message.created_at && (
                  <div className="who" style={{ marginTop: 4, textAlign: mine ? 'right' : 'left' }}>
                    {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <form className="chat-input" onSubmit={send}>
          <input
            ref={inputRef}
            aria-label="Message"
            placeholder="Type a message…"
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={500}
          />
          <button className="btn small" disabled={!connected || !text.trim()}>Send</button>
        </form>
      </aside>
    </>
  )
}
