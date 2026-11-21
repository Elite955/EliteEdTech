import { useEffect, useRef, useState, type PointerEvent } from 'react'
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

interface Point {
  x: number
  y: number
}

interface Stroke {
  id: string
  tool: 'pen' | 'eraser'
  color: string
  width: number
  points: Point[]
}

interface JoinReply {
  ok: boolean
  error?: string
  strokes?: Stroke[]
}

function drawStrokes(canvas: HTMLCanvasElement, strokes: Stroke[]) {
  const bounds = canvas.getBoundingClientRect()
  if (!bounds.width || !bounds.height) return
  const scale = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.round(bounds.width * scale)
  canvas.height = Math.round(bounds.height * scale)
  const context = canvas.getContext('2d')
  if (!context) return
  context.setTransform(scale, 0, 0, scale, 0, 0)
  context.clearRect(0, 0, bounds.width, bounds.height)

  for (const stroke of strokes) {
    if (!stroke.points.length) continue
    context.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over'
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.lineWidth = stroke.width
    context.strokeStyle = stroke.color
    context.fillStyle = stroke.color
    if (stroke.points.length === 1) {
      context.beginPath()
      context.arc(
        stroke.points[0].x * bounds.width,
        stroke.points[0].y * bounds.height,
        stroke.width / 2,
        0,
        Math.PI * 2,
      )
      context.fill()
      continue
    }
    context.beginPath()
    context.moveTo(stroke.points[0].x * bounds.width, stroke.points[0].y * bounds.height)
    for (let index = 1; index < stroke.points.length; index += 1) {
      context.lineTo(stroke.points[index].x * bounds.width, stroke.points[index].y * bounds.height)
    }
    context.stroke()
  }
  context.globalCompositeOperation = 'source-over'
}

function newStrokeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function SharedWhiteboard({ sessionId }: { sessionId: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const strokesRef = useRef<Stroke[]>([])
  const activeStrokeRef = useRef<Stroke | null>(null)
  const socketRef = useRef<ReturnType<typeof connectSocket> | null>(null)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen')
  const [color, setColor] = useState(COLORS[1])
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
        setConnected(true)
      })
    }
    function onDisconnect() {
      setConnected(false)
      setError('Connection lost. Reconnecting to the shared board…')
    }
    function onStrokeStart(stroke: Stroke) {
      setStrokes((current) => current.some((item) => item.id === stroke.id) ? current : [...current, stroke])
    }
    function onStrokePoints(payload: { strokeId: string; points: Point[] }) {
      setStrokes((current) => current.map((stroke) => (
        stroke.id === payload.strokeId ? { ...stroke, points: [...stroke.points, ...payload.points] } : stroke
      )))
    }
    function onClear() {
      setStrokes([])
    }
    function onBoardError(payload: { message?: string }) {
      setError(payload.message || 'The board update could not be applied.')
    }

    socket.on('connect', joinBoard)
    socket.on('disconnect', onDisconnect)
    socket.on('connect_error', onDisconnect)
    socket.on('whiteboard:stroke:start', onStrokeStart)
    socket.on('whiteboard:stroke:points', onStrokePoints)
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
      socket.off('whiteboard:clear', onClear)
      socket.off('whiteboard:error', onBoardError)
      socketRef.current = null
    }
  }, [sessionId])

  useEffect(() => {
    strokesRef.current = strokes
    if (canvasRef.current) drawStrokes(canvasRef.current, strokes)
  }, [strokes])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const resize = () => drawStrokes(canvas, strokesRef.current)
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  function pointFromEvent(event: PointerEvent<HTMLCanvasElement>): Point {
    const bounds = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    }
  }

  function startStroke(event: PointerEvent<HTMLCanvasElement>) {
    if (!connected || event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const stroke: Stroke = {
      id: newStrokeId(),
      tool,
      color: tool === 'eraser' ? '#ffffff' : color,
      width: tool === 'eraser' ? 24 : 3,
      points: [pointFromEvent(event)],
    }
    activeStrokeRef.current = stroke
    setStrokes((current) => [...current, stroke])
    socketRef.current?.emit('whiteboard:stroke:start', { sessionId, stroke }, (response: JoinReply) => {
      if (response?.ok) return
      activeStrokeRef.current = null
      setStrokes((current) => current.filter((item) => item.id !== stroke.id))
      setError(response?.error || 'Your drawing could not be shared.')
    })
  }

  function continueStroke(event: PointerEvent<HTMLCanvasElement>) {
    const activeStroke = activeStrokeRef.current
    if (!activeStroke) return
    event.preventDefault()
    const point = pointFromEvent(event)
    const updatedStroke = { ...activeStroke, points: [...activeStroke.points, point] }
    activeStrokeRef.current = updatedStroke
    setStrokes((current) => current.map((stroke) => stroke.id === activeStroke.id ? updatedStroke : stroke))
    socketRef.current?.emit('whiteboard:stroke:points', { sessionId, strokeId: activeStroke.id, points: [point] })
  }

  function clearBoard() {
    if (!connected || !strokes.length) return
    if (!window.confirm('Clear the shared board for both participants?')) return
    socketRef.current?.emit('whiteboard:clear', { sessionId }, (response: JoinReply) => {
      if (response?.ok) setStrokes([])
      else setError(response?.error || 'The board could not be cleared.')
    })
  }

  return (
    <section className="relative flex min-h-[480px] min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label="Shared math whiteboard">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3">
        <div className="mr-auto flex items-baseline gap-3">
          <h3 className="text-xl font-bold normal-case tracking-tight text-slate-950">miro</h3>
          <p className={`text-xs ${connected ? 'text-green-700' : 'text-slate-500'}`}>
            {connected ? '24h left · Live board' : 'Connecting…'}
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
              onClick={() => { setColor(item); setTool('pen') }}
              disabled={!connected}
            />
          ))}
        </div>
      </header>
      {error && <p className="m-0 bg-red-50 px-3 py-2 text-xs text-red-700" role="status">{error}</p>}
      <div
        className="relative min-h-[320px] flex-1 touch-none bg-white"
        style={{
          backgroundImage: 'linear-gradient(to right, #e8edf4 1px, transparent 1px), linear-gradient(to bottom, #e8edf4 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      >
        <div className="absolute left-2 top-3 z-10 flex w-12 flex-col items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-md" role="toolbar" aria-label="Whiteboard tools">
          <button type="button" aria-label="Select" className={`grid h-9 w-9 place-items-center rounded-md ${tool === 'pen' ? 'bg-slate-100' : 'hover:bg-slate-50'}`}><MousePointer2 size={18} /></button>
          <button type="button" aria-label="Pen" className={`grid h-9 w-9 place-items-center rounded-md ${tool === 'pen' ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'}`} onClick={() => setTool('pen')} disabled={!connected}><PenTool size={18} /></button>
          <button type="button" aria-label="Eraser" className={`grid h-9 w-9 place-items-center rounded-md ${tool === 'eraser' ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'}`} onClick={() => setTool('eraser')} disabled={!connected}><Eraser size={18} /></button>
          <button type="button" aria-label="Shape" className="grid h-9 w-9 place-items-center rounded-md text-slate-700 hover:bg-slate-50"><Square size={18} /></button>
          <button type="button" aria-label="Note" className="grid h-9 w-9 place-items-center rounded-md text-slate-700 hover:bg-slate-50"><StickyNote size={18} /></button>
          <button type="button" aria-label="Add" className="grid h-9 w-9 place-items-center rounded-md text-slate-700 hover:bg-slate-50"><Plus size={20} /></button>
        </div>
        <div className="absolute bottom-3 left-2 z-10 flex w-12 flex-col items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-md">
          <button type="button" aria-label="Undo" className="grid h-9 w-9 place-items-center rounded-md text-slate-700 hover:bg-slate-50" disabled={!strokes.length}><Undo2 size={17} /></button>
          <button type="button" aria-label="Redo" className="grid h-9 w-9 place-items-center rounded-md text-slate-700 hover:bg-slate-50"><Redo2 size={17} /></button>
        </div>
        <canvas
          ref={canvasRef}
          aria-label="Draw math notes for everyone in this class"
          className="absolute inset-0 h-full w-full touch-none"
          onPointerDown={startStroke}
          onPointerMove={continueStroke}
          onPointerUp={() => { activeStrokeRef.current = null }}
          onPointerCancel={() => { activeStrokeRef.current = null }}
          onLostPointerCapture={() => { activeStrokeRef.current = null }}
        />
        {!strokes.length && (
          <span className="pointer-events-none absolute inset-x-2 top-1/2 -translate-y-1/2 text-center text-xs text-slate-400">
            Write a solution here. Both of you can draw.
          </span>
        )}
        <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1 py-1 text-sm shadow-md">
          <button type="button" aria-label="Zoom out" className="grid h-7 w-7 place-items-center rounded text-slate-700 hover:bg-slate-50"><Minus size={16} /></button>
          <span className="min-w-12 text-center text-xs font-medium text-slate-800">100%</span>
          <button type="button" aria-label="Zoom in" className="grid h-7 w-7 place-items-center rounded text-slate-700 hover:bg-slate-50"><Plus size={16} /></button>
          <button type="button" aria-label="Help" className="grid h-7 w-7 place-items-center rounded text-slate-700 hover:bg-slate-50"><CircleHelp size={16} /></button>
        </div>
      </div>
    </section>
  )
}
