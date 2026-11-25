import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import {
  CircleHelp,
  Eraser,
  Minus,
  MousePointer2,
  PenTool,
  Plus,
  Redo2,
  Square,
  StickyNote,
  Undo2,
} from 'lucide-react'
import { connectSocket } from '../lib/socket'

const COLORS = ['#0f172a', '#2563eb', '#dc2626', '#16a34a', '#7c3aed']
const NOTE_WIDTH = 0.22
const NOTE_HEIGHT = 0.14

type Tool = 'select' | 'pen' | 'eraser' | 'rectangle' | 'ellipse' | 'note'

interface Point {
  x: number
  y: number
}

interface Stroke {
  id: string
  tool: Exclude<Tool, 'select'>
  color: string
  width: number
  points: Point[]
  text?: string
}

interface JoinReply {
  ok: boolean
  error?: string
  strokes?: Stroke[]
}

interface DragState {
  id: string
  start: Point
  original: Point[]
  updated: Stroke[]
  moved: boolean
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value))
}

function strokeBounds(stroke: Stroke) {
  if (stroke.tool === 'note' && stroke.points[0]) {
    return {
      left: stroke.points[0].x,
      top: stroke.points[0].y,
      right: stroke.points[0].x + NOTE_WIDTH,
      bottom: stroke.points[0].y + NOTE_HEIGHT,
    }
  }
  const xs = stroke.points.map((point) => point.x)
  const ys = stroke.points.map((point) => point.y)
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  }
}

function drawNote(context: CanvasRenderingContext2D, stroke: Stroke, width: number, height: number) {
  const point = stroke.points[0]
  if (!point) return
  const x = point.x * width
  const y = point.y * height
  const noteWidth = NOTE_WIDTH * width
  const noteHeight = NOTE_HEIGHT * height
  context.save()
  context.fillStyle = '#fef3c7'
  context.strokeStyle = '#f59e0b'
  context.lineWidth = 1.5
  context.beginPath()
  context.roundRect(x, y, noteWidth, noteHeight, 8)
  context.fill()
  context.stroke()
  context.fillStyle = '#78350f'
  context.font = '12px system-ui, sans-serif'
  context.textBaseline = 'top'
  const words = (stroke.text ?? '').split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (context.measureText(candidate).width > noteWidth - 16 && line) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
    if (lines.length >= 5) break
  }
  if (line && lines.length < 5) lines.push(line)
  lines.slice(0, 5).forEach((item, index) => {
    context.fillText(item, x + 8, y + 8 + index * 15, noteWidth - 16)
  })
  context.restore()
}

function drawStrokes(canvas: HTMLCanvasElement, strokes: Stroke[], selectedId: string | null) {
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  if (!width || !height) return
  const scale = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const context = canvas.getContext('2d')
  if (!context) return
  context.setTransform(scale, 0, 0, scale, 0, 0)
  context.clearRect(0, 0, width, height)

  for (const stroke of strokes) {
    if (stroke.tool === 'note') {
      drawNote(context, stroke, width, height)
      continue
    }
    if (!stroke.points.length) continue
    context.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over'
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.lineWidth = stroke.width
    context.strokeStyle = stroke.color
    context.fillStyle = stroke.color

    if (stroke.tool === 'rectangle' && stroke.points.length >= 2) {
      const first = stroke.points[0]
      const last = stroke.points[stroke.points.length - 1]
      context.strokeRect(
        first.x * width,
        first.y * height,
        (last.x - first.x) * width,
        (last.y - first.y) * height,
      )
      continue
    }
    if (stroke.tool === 'ellipse' && stroke.points.length >= 2) {
      const first = stroke.points[0]
      const last = stroke.points[stroke.points.length - 1]
      const centerX = ((first.x + last.x) / 2) * width
      const centerY = ((first.y + last.y) / 2) * height
      context.beginPath()
      context.ellipse(
        centerX,
        centerY,
        Math.abs((last.x - first.x) * width) / 2,
        Math.abs((last.y - first.y) * height) / 2,
        0,
        0,
        Math.PI * 2,
      )
      context.stroke()
      continue
    }

    if (stroke.points.length === 1) {
      context.beginPath()
      context.arc(
        stroke.points[0].x * width,
        stroke.points[0].y * height,
        stroke.width / 2,
        0,
        Math.PI * 2,
      )
      context.fill()
      continue
    }
    context.beginPath()
    context.moveTo(stroke.points[0].x * width, stroke.points[0].y * height)
    for (let index = 1; index < stroke.points.length; index += 1) {
      context.lineTo(stroke.points[index].x * width, stroke.points[index].y * height)
    }
    context.stroke()
  }
  context.globalCompositeOperation = 'source-over'

  const selected = strokes.find((stroke) => stroke.id === selectedId)
  if (selected) {
    const bounds = strokeBounds(selected)
    context.save()
    context.strokeStyle = '#2563eb'
    context.lineWidth = 1.5
    context.setLineDash([6, 4])
    context.strokeRect(
      bounds.left * width - 5,
      bounds.top * height - 5,
      (bounds.right - bounds.left) * width + 10,
      (bounds.bottom - bounds.top) * height + 10,
    )
    context.restore()
  }
}

function newStrokeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function hitTest(strokes: Stroke[], point: Point) {
  for (let index = strokes.length - 1; index >= 0; index -= 1) {
    const stroke = strokes[index]
    if (!stroke.points.length) continue
    const bounds = strokeBounds(stroke)
    const padding = 0.012
    if (
      point.x >= bounds.left - padding &&
      point.x <= bounds.right + padding &&
      point.y >= bounds.top - padding &&
      point.y <= bounds.bottom + padding
    ) {
      return stroke.id
    }
  }
  return null
}

export function SharedWhiteboard({ sessionId }: { sessionId: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const strokesRef = useRef<Stroke[]>([])
  const activeStrokeRef = useRef<Stroke | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const socketRef = useRef<ReturnType<typeof connectSocket> | null>(null)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState(COLORS[1])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [helpOpen, setHelpOpen] = useState(false)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const socket = connectSocket()
    socketRef.current = socket
    let active = true

    function joinBoard() {
      setConnected(false)
      setError('')
      socket.emit('whiteboard:join', { sessionId }, (response: JoinReply) => {
        if (!active) return
        if (!response?.ok) {
          setError(response?.error || 'The shared board could not be opened.')
          return
        }
        setStrokes(response.strokes || [])
        setSelectedId(null)
        setConnected(true)
      })
    }
    function onDisconnect() {
      setConnected(false)
      setError('Connection lost. Reconnecting to the shared board...')
    }
    function onStrokeStart(stroke: Stroke) {
      setStrokes((current) => current.some((item) => item.id === stroke.id) ? current : [...current, stroke])
    }
    function onStrokePoints(payload: { strokeId: string; points: Point[] }) {
      setStrokes((current) => current.map((stroke) => (
        stroke.id === payload.strokeId ? { ...stroke, points: [...stroke.points, ...payload.points] } : stroke
      )))
    }
    function onRemove(payload: { strokeId: string }) {
      setStrokes((current) => current.filter((stroke) => stroke.id !== payload.strokeId))
      setSelectedId((current) => current === payload.strokeId ? null : current)
    }
    function onReplace(payload: { strokes?: Stroke[] }) {
      setStrokes(payload.strokes || [])
      setSelectedId(null)
    }
    function onClear() {
      setStrokes([])
      setSelectedId(null)
    }
    function onBoardError(payload: { message?: string }) {
      setError(payload.message || 'The board update could not be applied.')
    }

    socket.on('connect', joinBoard)
    socket.on('disconnect', onDisconnect)
    socket.on('connect_error', onDisconnect)
    socket.on('whiteboard:stroke:start', onStrokeStart)
    socket.on('whiteboard:stroke:points', onStrokePoints)
    socket.on('whiteboard:remove', onRemove)
    socket.on('whiteboard:replace', onReplace)
    socket.on('whiteboard:clear', onClear)
    socket.on('whiteboard:error', onBoardError)
    if (socket.connected) joinBoard()

    return () => {
      active = false
      if (socket.connected) socket.emit('whiteboard:leave', { sessionId })
      socket.off('connect', joinBoard)
      socket.off('disconnect', onDisconnect)
      socket.off('connect_error', onDisconnect)
      socket.off('whiteboard:stroke:start', onStrokeStart)
      socket.off('whiteboard:stroke:points', onStrokePoints)
      socket.off('whiteboard:remove', onRemove)
      socket.off('whiteboard:replace', onReplace)
      socket.off('whiteboard:clear', onClear)
      socket.off('whiteboard:error', onBoardError)
      socketRef.current = null
    }
  }, [sessionId])

  useEffect(() => {
    strokesRef.current = strokes
    if (canvasRef.current) drawStrokes(canvasRef.current, strokes, selectedId)
  }, [strokes, selectedId, zoom])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const resize = () => drawStrokes(canvas, strokesRef.current, selectedId)
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [selectedId])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!selectedId || !connected) return
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return
      event.preventDefault()
      deleteSelected()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  function pointFromEvent(event: PointerEvent<HTMLCanvasElement>): Point {
    const bounds = event.currentTarget.getBoundingClientRect()
    return {
      x: clamp((event.clientX - bounds.left) / bounds.width),
      y: clamp((event.clientY - bounds.top) / bounds.height),
    }
  }

  function addNote(point?: Point) {
    if (!connected) return
    const text = window.prompt('Sticky note text')
    if (!text?.trim()) return
    const note: Stroke = {
      id: newStrokeId(),
      tool: 'note',
      color: '#0f172a',
      width: 2,
      points: [point ?? { x: 0.39, y: 0.43 }],
      text: text.trim().slice(0, 500),
    }
    setStrokes((current) => [...current, note])
    socketRef.current?.emit('whiteboard:stroke:start', { sessionId, stroke: note }, (response: JoinReply) => {
      if (response?.ok) {
        setSelectedId(note.id)
        setTool('select')
        return
      }
      setStrokes((current) => current.filter((item) => item.id !== note.id))
      setError(response?.error || 'The note could not be shared.')
    })
  }

  function startStroke(event: PointerEvent<HTMLCanvasElement>) {
    if (!connected || event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = pointFromEvent(event)

    if (tool === 'select') {
      const hit = hitTest(strokesRef.current, point)
      setSelectedId(hit)
      if (!hit) return
      const stroke = strokesRef.current.find((item) => item.id === hit)
      if (!stroke) return
      dragRef.current = {
        id: hit,
        start: point,
        original: stroke.points.map((item) => ({ ...item })),
        updated: strokesRef.current,
        moved: false,
      }
      return
    }

    if (tool === 'note') {
      addNote({ x: clamp(point.x - NOTE_WIDTH / 2), y: clamp(point.y - NOTE_HEIGHT / 2) })
      return
    }

    const stroke: Stroke = {
      id: newStrokeId(),
      tool,
      color: tool === 'eraser' ? '#ffffff' : color,
      width: tool === 'eraser' ? 24 : 3,
      points: tool === 'rectangle' || tool === 'ellipse' ? [point, point] : [point],
    }
    activeStrokeRef.current = stroke
    setStrokes((current) => [...current, stroke])

    if (tool === 'pen' || tool === 'eraser') {
      socketRef.current?.emit('whiteboard:stroke:start', { sessionId, stroke }, (response: JoinReply) => {
        if (response?.ok) return
        activeStrokeRef.current = null
        setStrokes((current) => current.filter((item) => item.id !== stroke.id))
        setError(response?.error || 'Your drawing could not be shared.')
      })
    }
  }

  function continueStroke(event: PointerEvent<HTMLCanvasElement>) {
    const point = pointFromEvent(event)
    const drag = dragRef.current
    if (drag) {
      event.preventDefault()
      const deltaX = point.x - drag.start.x
      const deltaY = point.y - drag.start.y
      if (Math.abs(deltaX) > 0.002 || Math.abs(deltaY) > 0.002) drag.moved = true
      const updated = strokesRef.current.map((stroke) => {
        if (stroke.id !== drag.id) return stroke
        return {
          ...stroke,
          points: drag.original.map((original) => ({
            x: clamp(original.x + deltaX),
            y: clamp(original.y + deltaY),
          })),
        }
      })
      drag.updated = updated
      setStrokes(updated)
      return
    }

    const activeStroke = activeStrokeRef.current
    if (!activeStroke) return
    event.preventDefault()
    if (activeStroke.tool === 'rectangle' || activeStroke.tool === 'ellipse') {
      const updatedStroke = { ...activeStroke, points: [activeStroke.points[0], point] }
      activeStrokeRef.current = updatedStroke
      setStrokes((current) => current.map((stroke) => stroke.id === activeStroke.id ? updatedStroke : stroke))
      return
    }
    const updatedStroke = { ...activeStroke, points: [...activeStroke.points, point] }
    activeStrokeRef.current = updatedStroke
    setStrokes((current) => current.map((stroke) => stroke.id === activeStroke.id ? updatedStroke : stroke))
    socketRef.current?.emit('whiteboard:stroke:points', { sessionId, strokeId: activeStroke.id, points: [point] })
  }

  function finishStroke() {
    const drag = dragRef.current
    if (drag) {
      dragRef.current = null
      if (!drag.moved) return
      socketRef.current?.emit('whiteboard:replace', { sessionId, strokes: drag.updated }, (response: JoinReply) => {
        if (response?.ok) return
        setError(response?.error || 'The board item could not be moved.')
      })
      return
    }
    const activeStroke = activeStrokeRef.current
    activeStrokeRef.current = null
    if (!activeStroke) return
    if (activeStroke.tool !== 'rectangle' && activeStroke.tool !== 'ellipse') return
    if (activeStroke.points.length < 2 ||
      (activeStroke.points[0].x === activeStroke.points[1].x &&
        activeStroke.points[0].y === activeStroke.points[1].y)) {
      setStrokes((current) => current.filter((stroke) => stroke.id !== activeStroke.id))
      return
    }
    socketRef.current?.emit('whiteboard:stroke:start', { sessionId, stroke: activeStroke }, (response: JoinReply) => {
      if (response?.ok) {
        setSelectedId(activeStroke.id)
        return
      }
      setStrokes((current) => current.filter((stroke) => stroke.id !== activeStroke.id))
      setError(response?.error || 'The shape could not be shared.')
    })
  }

  function deleteSelected() {
    if (!selectedId || !connected) return
    const strokeId = selectedId
    socketRef.current?.emit('whiteboard:delete', { sessionId, strokeId }, (response: JoinReply) => {
      if (response?.ok) {
        setStrokes((current) => current.filter((stroke) => stroke.id !== strokeId))
        setSelectedId(null)
      } else {
        setError(response?.error || 'The board item could not be removed.')
      }
    })
  }

  function undo() {
    if (!connected) return
    socketRef.current?.emit('whiteboard:undo', { sessionId }, (response: JoinReply) => {
      if (response?.ok) {
        setStrokes(response.strokes || [])
        setSelectedId(null)
      } else {
        setError(response?.error || 'There is nothing to undo.')
      }
    })
  }

  function redo() {
    if (!connected) return
    socketRef.current?.emit('whiteboard:redo', { sessionId }, (response: JoinReply) => {
      if (response?.ok) {
        setStrokes(response.strokes || [])
        setSelectedId(null)
      } else {
        setError(response?.error || 'There is nothing to redo.')
      }
    })
  }

  function clearBoard() {
    if (!connected || !strokes.length) return
    if (!window.confirm('Clear the shared board for both participants?')) return
    socketRef.current?.emit('whiteboard:clear', { sessionId }, (response: JoinReply) => {
      if (response?.ok) {
        setStrokes([])
        setSelectedId(null)
      } else {
        setError(response?.error || 'The board could not be cleared.')
      }
    })
  }

  const toolButton = (value: Tool, label: string, icon: ReactNode) => (
    <button
      type="button"
      aria-label={label}
      aria-pressed={tool === value}
      title={label}
      className={`grid h-9 w-9 place-items-center rounded-md ${tool === value ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'}`}
      onClick={() => setTool(value)}
      disabled={!connected}
    >
      {icon}
    </button>
  )

  return (
    <section className="relative flex min-h-[480px] min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label="Shared math whiteboard">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3">
        <div className="mr-auto flex items-baseline gap-3">
          <h3 className="text-xl font-bold normal-case tracking-tight text-slate-950">miro</h3>
          <p className={`text-xs ${connected ? 'text-green-700' : 'text-slate-500'}`}>
            {connected ? '24h left - Live board' : 'Connecting...'}
          </p>
        </div>
        <button type="button" className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 disabled:opacity-50" onClick={clearBoard} disabled={!connected || !strokes.length}>Clear</button>
        <div className="flex gap-1" role="group" aria-label="Pen color">
          {COLORS.map((item) => (
            <button
              key={item}
              type="button"
              aria-label={`Use ${item} pen`}
              aria-pressed={color === item}
              className={`h-5 w-5 rounded-full border-2 ${color === item ? 'border-blue-600' : 'border-white ring-1 ring-slate-300'} disabled:opacity-50`}
              style={{ backgroundColor: item }}
              onClick={() => { setColor(item); if (tool !== 'rectangle' && tool !== 'ellipse') setTool('pen') }}
              disabled={!connected}
            />
          ))}
        </div>
      </header>
      {error && <p className="m-0 bg-red-50 px-3 py-2 text-xs text-red-700" role="status">{error}</p>}
      <div
        className="relative min-h-[320px] flex-1 touch-none overflow-hidden bg-white"
        style={{
          backgroundImage: 'linear-gradient(to right, #e8edf4 1px, transparent 1px), linear-gradient(to bottom, #e8edf4 1px, transparent 1px)',
          backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute left-2 top-3 z-20 flex w-12 flex-col items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-md" role="toolbar" aria-label="Whiteboard tools">
          {toolButton('select', 'Select and move', <MousePointer2 size={18} />)}
          {toolButton('pen', 'Pen', <PenTool size={18} />)}
          {toolButton('eraser', 'Eraser', <Eraser size={18} />)}
          {toolButton('rectangle', 'Rectangle', <Square size={18} />)}
          {toolButton('ellipse', 'Ellipse', <span className="h-4 w-4 rounded-full border-2 border-current" aria-hidden="true" />)}
          {toolButton('note', 'Sticky note', <StickyNote size={18} />)}
          <button type="button" aria-label="Add sticky note" title="Add sticky note" className="grid h-9 w-9 place-items-center rounded-md text-slate-700 hover:bg-slate-50" onClick={() => addNote()} disabled={!connected}><Plus size={20} /></button>
        </div>
        <div className="absolute bottom-3 left-2 z-20 flex w-12 flex-col items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-md">
          <button type="button" aria-label="Undo" title="Undo" className="grid h-9 w-9 place-items-center rounded-md text-slate-700 hover:bg-slate-50" onClick={undo} disabled={!connected}><Undo2 size={17} /></button>
          <button type="button" aria-label="Redo" title="Redo" className="grid h-9 w-9 place-items-center rounded-md text-slate-700 hover:bg-slate-50" onClick={redo} disabled={!connected}><Redo2 size={17} /></button>
        </div>
        <canvas
          ref={canvasRef}
          aria-label="Draw math notes for everyone in this class"
          className="absolute inset-0 h-full w-full origin-center touch-none"
          style={{ transform: `scale(${zoom})` }}
          onPointerDown={startStroke}
          onPointerMove={continueStroke}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          onLostPointerCapture={finishStroke}
        />
        {!strokes.length && (
          <span className="pointer-events-none absolute inset-x-2 top-1/2 z-10 -translate-y-1/2 text-center text-xs text-slate-400">
            Write a solution here. Both of you can draw.
          </span>
        )}
        {helpOpen && (
          <div className="absolute bottom-16 right-3 z-30 w-64 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-xl">
            <strong className="mb-1 block text-slate-900">Whiteboard help</strong>
            Pick a pen, eraser, shape or sticky note. Use Select to move items, then press Delete to remove them. Undo and redo step through board changes. Zoom keeps both sides of the board reachable.
          </div>
        )}
        <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1 py-1 text-sm shadow-md">
          <button type="button" aria-label="Zoom out" className="grid h-7 w-7 place-items-center rounded text-slate-700 hover:bg-slate-50" onClick={() => setZoom((current) => Math.max(0.5, Number((current - 0.1).toFixed(2))))} disabled={zoom <= 0.5}><Minus size={16} /></button>
          <span className="min-w-12 text-center text-xs font-medium text-slate-800">{Math.round(zoom * 100)}%</span>
          <button type="button" aria-label="Zoom in" className="grid h-7 w-7 place-items-center rounded text-slate-700 hover:bg-slate-50" onClick={() => setZoom((current) => Math.min(2, Number((current + 0.1).toFixed(2))))} disabled={zoom >= 2}><Plus size={16} /></button>
          <button type="button" aria-label="Help" aria-expanded={helpOpen} className="grid h-7 w-7 place-items-center rounded text-slate-700 hover:bg-slate-50" onClick={() => setHelpOpen((current) => !current)}><CircleHelp size={16} /></button>
        </div>
      </div>
    </section>
  )
}
