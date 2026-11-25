import { useEffect, useRef, useState } from 'react'
import { api, apiUrl } from '../api/client'
import { connectSocket } from '../api/socket'

function formatBytes(bytes) {
  if (!bytes) return 'Link'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ClassResourcesPanel({ sessionId, teacherName }) {
  const [tab, setTab] = useState('materials')
  const [materials, setMaterials] = useState([])
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [connected, setConnected] = useState(false)
  const chatEndRef = useRef(null)

  useEffect(() => {
    let active = true
    Promise.all([
      api.get(`/sessions/${sessionId}/materials`),
      api.get(`/sessions/${sessionId}/messages`),
    ])
      .then(([materialResult, messageResult]) => {
        if (!active) return
        setMaterials(materialResult?.materials || [])
        setMessages(messageResult?.messages || [])
      })
      .catch((err) => { if (active) setError(err.message) })
    return () => { active = false }
  }, [sessionId])

  useEffect(() => {
    const socket = connectSocket()
    let active = true
    function joinChat() {
      setConnected(false)
      socket.emit('class:join', { sessionId }, (response) => {
        if (!active) return
        if (!response?.ok) {
          setError(response?.error || 'The class chat could not be opened.')
          return
        }
        setConnected(true)
      })
    }
    function onMessage(message) {
      if (message.session_id !== sessionId) return
      setMessages((current) => [...current, message])
    }
    function onDisconnect() { setConnected(false) }
    function onChatError(payload) {
      setError(payload?.message || 'The class chat could not be updated.')
    }
    socket.on('connect', joinChat)
    socket.on('disconnect', onDisconnect)
    socket.on('class:message:new', onMessage)
    socket.on('class:error', onChatError)
    if (socket.connected) joinChat()
    return () => {
      active = false
      if (socket.connected) socket.emit('class:leave', { sessionId })
      socket.off('connect', joinChat)
      socket.off('disconnect', onDisconnect)
      socket.off('class:message:new', onMessage)
      socket.off('class:error', onChatError)
    }
  }, [sessionId])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: 'nearest' })
  }, [messages, tab])

  function sendMessage() {
    const content = draft.trim()
    if (!content) return
    setError('')
    const socket = connectSocket()
    socket.emit('class:message', { sessionId, content }, (response) => {
      if (!response?.ok) {
        setError(response?.error || 'The message could not be sent.')
        return
      }
      setDraft('')
    })
  }

  return (
    <section className="class-resources" aria-label="Class materials and private chat">
      <div className="class-resources-head">
        <div>
          <strong>Class resources</strong>
          <span>Private to you and {teacherName || 'your teacher'}.</span>
        </div>
        <div className="class-resources-tabs">
          <button type="button" className={tab === 'materials' ? 'is-active' : ''} onClick={() => setTab('materials')}>Materials</button>
          <button type="button" className={tab === 'chat' ? 'is-active' : ''} onClick={() => setTab('chat')}>Private chat</button>
        </div>
      </div>

      {error && <p className="class-resources-error" role="status">{error}</p>}

      {tab === 'materials' ? (
        <ul className="class-resources-list">
          {materials.length === 0 && <li className="class-resources-empty">Your teacher has not added materials yet.</li>}
          {materials.map((material) => (
            <li key={material.id}>
              <div className="class-resources-item">
                <span className="class-resources-mark" aria-hidden="true">{material.external_url ? 'L' : 'F'}</span>
                <div>
                  <strong>{material.title}</strong>
                  <span>{material.description || material.external_url || `${material.filename} - ${formatBytes(material.size_bytes)}`}</span>
                </div>
                {material.has_file ? (
                  <a
                    className="class-resources-action"
                    href={apiUrl(`/sessions/${sessionId}/materials/${material.id}/file`)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open
                  </a>
                ) : material.external_url ? (
                  <a className="class-resources-action" href={material.external_url} target="_blank" rel="noopener noreferrer">
                    Open
                  </a>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="class-resources-chat">
          <span className="class-resources-status">{connected ? 'Private chat is live' : 'Connecting to private chat...'}</span>
          <div className="class-resources-messages">
            {messages.length === 0 && <p className="class-resources-empty">No messages yet. You can ask your teacher a question here.</p>}
            {messages.map((message) => (
              <div
                key={message.id}
                className={`class-resources-message${message.sender_role === 'student' ? ' is-mine' : ''}`}
              >
                <span>{message.sender_name}</span>
                <p>{message.content}</p>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="class-resources-compose">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  sendMessage()
                }
              }}
              placeholder="Message your teacher privately"
              maxLength={500}
            />
            <button type="button" className="btn small" onClick={sendMessage} disabled={!draft.trim() || !connected}>
              Send
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
