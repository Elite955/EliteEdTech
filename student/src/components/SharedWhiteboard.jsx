import { useEffect, useRef, useState } from 'react'
import { connectSocket } from '../api/socket'

const NOTE_WIDTH = 0.22
const NOTE_HEIGHT = 0.14

function drawNote(context, stroke, width, height) {
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
  const words = (stroke.text || '').split(/\s+/).filter(Boolean)
  const lines = []
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

function drawStrokes(canvas, strokes) {
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
    const points = stroke.points
    if (!points.length) continue
    context.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over'
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.lineWidth = stroke.width
    context.strokeStyle = stroke.color
    context.fillStyle = stroke.color

    if (stroke.tool === 'rectangle' && points.length >= 2) {
      const first = points[0]
      const last = points[points.length - 1]
      context.strokeRect(
        first.x * width,
        first.y * height,
        (last.x - first.x) * width,
        (last.y - first.y) * height,
      )
      continue
    }
    if (stroke.tool === 'ellipse' && points.length >= 2) {
      const first = points[0]
      const last = points[points.length - 1]
      context.beginPath()
      context.ellipse(
        ((first.x + last.x) / 2) * width,
        ((first.y + last.y) / 2) * height,
        Math.abs((last.x - first.x) * width) / 2,
        Math.abs((last.y - first.y) * height) / 2,
        0,
        0,
        Math.PI * 2,
      )
      context.stroke()
      continue
    }

    if (points.length === 1) {
      context.beginPath()
      context.arc(points[0].x * width, points[0].y * height, stroke.width / 2, 0, Math.PI * 2)
      context.fill()
      continue
    }
    context.beginPath()
    context.moveTo(points[0].x * width, points[0].y * height)
    for (let index = 1; index < points.length; index += 1) {
      context.lineTo(points[index].x * width, points[index].y * height)
    }
    context.stroke()
  }
  context.globalCompositeOperation = 'source-over'
}

export default function SharedWhiteboard({ sessionId }) {
  const canvasRef = useRef(null)
  const strokesRef = useRef([])
  const [strokes, setStrokes] = useState([])
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const socket = connectSocket()
    let active = true

    function joinBoard() {
      setConnected(false)
      setError('')
      socket.emit('whiteboard:join', { sessionId }, (response) => {
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
      setError('Connection lost. Reconnecting to the shared board...')
    }
    function onStrokeStart(stroke) {
      setStrokes((current) => current.some((item) => item.id === stroke.id) ? current : [...current, stroke])
    }
    function onStrokePoints({ strokeId, points }) {
      setStrokes((current) => current.map((stroke) => (
        stroke.id === strokeId ? { ...stroke, points: [...stroke.points, ...points] } : stroke
      )))
    }
    function onRemove({ strokeId }) {
      setStrokes((current) => current.filter((stroke) => stroke.id !== strokeId))
    }
    function onReplace(payload) {
      setStrokes(payload?.strokes || [])
    }
    function onClear() {
      setStrokes([])
    }
    function onBoardError(payload) {
      setError(payload?.message || 'The board update could not be applied.')
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

  return (
    <section className="shared-whiteboard" aria-label="Shared math whiteboard">
      <header className="whiteboard-toolbar">
        <div>
          <strong>miro</strong>
          <span className={`whiteboard-connection${connected ? ' is-connected' : ''}`}>
            {connected ? 'Live board' : 'Connecting...'}
          </span>
        </div>
      </header>
      {error && <p className="whiteboard-error" role="status">{error}</p>}
      <div className="whiteboard-canvas-wrap">
        <div className="whiteboard-side-tools" aria-hidden="true">
          <span>P</span><span>E</span><span>R</span><span>O</span><span>N</span>
        </div>
        <div className="whiteboard-undo-tools" aria-hidden="true"><span>U</span><span>R</span></div>
        <canvas
          ref={canvasRef}
          aria-label="View the teacher's math notes"
          className="is-view-only"
        />
        {!strokes.length && <span className="whiteboard-hint">Your teacher's writing will appear here.</span>}
      </div>
    </section>
  )
}
