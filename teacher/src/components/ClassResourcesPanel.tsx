import { useEffect, useRef, useState } from 'react'
import { Download, FileText, Link2, MessageCircle, Paperclip, Send, Trash2 } from 'lucide-react'
import { api, apiUrl, getErrorMessage } from '../lib/api'
import { connectSocket } from '../lib/socket'

type Material = {
  id: string
  session_id: string
  title: string
  description: string
  filename: string
  mime_type: string
  size_bytes: number
  external_url: string | null
  has_file: boolean
  created_at: string
}

type ClassMessage = {
  id: string
  session_id: string
  sender_id: string
  sender_name: string
  sender_role: 'teacher' | 'student'
  recipient_id: string
  content: string
  created_at: string
}

function formatBytes(bytes: number): string {
  if (!bytes) return 'Link'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ClassResourcesPanel({
  sessionId,
  studentName,
}: {
  sessionId: string
  studentName?: string
}) {
  const [tab, setTab] = useState<'materials' | 'chat'>('materials')
  const [materials, setMaterials] = useState<Material[]>([])
  const [messages, setMessages] = useState<ClassMessage[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [link, setLink] = useState('')
  const [linkTitle, setLinkTitle] = useState('')
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [connected, setConnected] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    void Promise.all([
      api<{ materials: Material[] }>(`/teacher/sessions/${sessionId}/materials`),
      api<{ messages: ClassMessage[] }>(`/teacher/sessions/${sessionId}/messages`),
    ])
      .then(([materialResult, messageResult]) => {
        if (!active) return
        setMaterials(materialResult.materials ?? [])
        setMessages(messageResult.messages ?? [])
      })
      .catch((err: unknown) => { if (active) setError(getErrorMessage(err)) })
    return () => { active = false }
  }, [sessionId])

  useEffect(() => {
    const socket = connectSocket()
    let active = true
    function joinChat() {
      setConnected(false)
      socket.emit('class:join', { sessionId }, (response: { ok?: boolean; error?: string } | undefined) => {
        if (!active) return
        if (!response?.ok) {
          setError(response?.error || 'The class chat could not be opened.')
          return
        }
        setConnected(true)
      })
    }
    function onMessage(message: ClassMessage) {
      if (message.session_id !== sessionId) return
      setMessages((current) => [...current, message])
    }
    function onDisconnect() { setConnected(false) }
    function onChatError(payload: { message?: string }) {
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

  async function uploadFile() {
    if (!file) {
      setError('Choose a file to upload.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const response = await fetch(apiUrl(`/teacher/sessions/${sessionId}/materials/file`), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'X-Portal': 'teacher',
          'Content-Type': 'application/octet-stream',
          'X-Material-Title': encodeURIComponent(title.trim() || file.name),
          'X-Material-Description': encodeURIComponent(description.trim()),
          'X-Filename': encodeURIComponent(file.name),
          'X-Material-Mime': encodeURIComponent(file.type || 'application/octet-stream'),
        },
        body: file,
      })
      const text = await response.text()
      const payload = (() => { try { return JSON.parse(text || 'null') } catch { return null } })() as
        | { material?: Material; error?: string }
        | null
      if (!response.ok || !payload?.material) {
        throw new Error(payload?.error || `Upload failed (${response.status}).`)
      }
      setMaterials((current) => [payload.material!, ...current])
      setFile(null)
      setTitle('')
      setDescription('')
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function addLink() {
    if (!link.trim()) {
      setError('Paste a link to add.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await api<{ material: Material }>(`/teacher/sessions/${sessionId}/materials`, {
        method: 'POST',
        body: JSON.stringify({
          title: linkTitle.trim() || 'Resource link',
          description: description.trim(),
          external_url: link.trim(),
        }),
      })
      setMaterials((current) => [result.material, ...current])
      setLink('')
      setLinkTitle('')
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function deleteMaterial(material: Material) {
    if (!window.confirm(`Remove "${material.title}" from this class?`)) return
    setError('')
    try {
      await api(`/teacher/sessions/${sessionId}/materials/${material.id}`, { method: 'DELETE' })
      setMaterials((current) => current.filter((item) => item.id !== material.id))
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  function sendMessage() {
    const content = draft.trim()
    if (!content) return
    setError('')
    const socket = connectSocket()
    socket.emit('class:message', { sessionId, content }, (response: { ok?: boolean; error?: string } | undefined) => {
      if (!response?.ok) {
        setError(response?.error || 'The message could not be sent.')
        return
      }
      setDraft('')
    })
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Class resources</h3>
          <p className="text-xs text-slate-500">
            Shared privately with {studentName || 'this student'}.
          </p>
        </div>
        <div className="flex rounded-lg bg-slate-100 p-0.5">
          <button
            type="button"
            onClick={() => setTab('materials')}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${tab === 'materials' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
          >
            Materials
          </button>
          <button
            type="button"
            onClick={() => setTab('chat')}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${tab === 'chat' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
          >
            Private chat
          </button>
        </div>
      </div>

      {error && <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-700">{error}</p>}

      {tab === 'materials' ? (
        <div className="mt-3 space-y-3">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="space-y-1.5">
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Material title"
                maxLength={160}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
              />
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Short note (optional)"
                maxLength={1000}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
              />
              <input
                type="file"
                onChange={(event) => {
                  const picked = event.target.files?.[0] ?? null
                  setFile(picked)
                  if (picked && !title) setTitle(picked.name)
                }}
                className="block w-full text-xs text-slate-600"
              />
            </div>
            <button
              type="button"
              onClick={() => void uploadFile()}
              disabled={busy || !file}
              className="inline-flex items-center justify-center gap-1.5 self-end rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Paperclip size={14} /> Upload
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_auto]">
            <input
              value={link}
              onChange={(event) => setLink(event.target.value)}
              placeholder="https://..."
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
            />
            <input
              value={linkTitle}
              onChange={(event) => setLinkTitle(event.target.value)}
              placeholder="Link title"
              maxLength={160}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
            />
            <button
              type="button"
              onClick={() => void addLink()}
              disabled={busy || !link.trim()}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Link2 size={14} /> Add link
            </button>
          </div>

          <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
            {materials.length === 0 && <li className="text-xs text-slate-500">No materials added yet.</li>}
            {materials.map((material) => (
              <li key={material.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-2">
                <span className="grid h-7 w-7 flex-none place-items-center rounded-md bg-slate-100 text-slate-600">
                  {material.external_url ? <Link2 size={14} /> : <FileText size={14} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-slate-900">{material.title}</p>
                  <p className="truncate text-[11px] text-slate-500">
                    {material.external_url || `${material.filename} - ${formatBytes(material.size_bytes)}`}
                  </p>
                </div>
                {material.has_file ? (
                  <a
                    href={apiUrl(`/teacher/sessions/${sessionId}/materials/${material.id}/file`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    aria-label={`Open ${material.title}`}
                  >
                    <Download size={14} />
                  </a>
                ) : material.external_url ? (
                  <a
                    href={material.external_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    aria-label={`Open ${material.title}`}
                  >
                    <Link2 size={14} />
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={() => void deleteMaterial(material)}
                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  aria-label={`Remove ${material.title}`}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="mt-3">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <MessageCircle size={12} />
            {connected ? 'Private chat is live' : 'Connecting to private chat...'}
          </div>
          <div className="mt-2 max-h-48 space-y-1.5 overflow-y-auto rounded-lg bg-slate-50 p-2">
            {messages.length === 0 && <p className="text-xs text-slate-500">No messages yet. Say hello.</p>}
            {messages.map((message) => (
              <div
                key={message.id}
                className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs ${message.sender_role === 'teacher' ? 'ml-auto bg-blue-600 text-white' : 'bg-white text-slate-800'}`}
              >
                <p className={message.sender_role === 'teacher' ? 'text-[10px] text-blue-100' : 'text-[10px] text-slate-500'}>
                  {message.sender_name}
                </p>
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="mt-2 flex gap-2">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  sendMessage()
                }
              }}
              placeholder="Message this student privately"
              maxLength={500}
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
            />
            <button
              type="button"
              onClick={sendMessage}
              disabled={!draft.trim() || !connected}
              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Send size={13} /> Send
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
