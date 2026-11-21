import { useEffect, useRef, useState } from 'react'
import { connectSocket } from '../api/socket'

function drawStrokes(canvas, strokes) {
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
    const points = stroke.points
    if (!points.length) continue
    context.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over'
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.lineWidth = stroke.width
    context.strokeStyle = stroke.color
    context.fillStyle = stroke.color
    if (points.length === 1) {
      context.beginPath()
      context.arc(points[0].x * bounds.width, points[0].y * bounds.height, stroke.width / 2, 0, Math.PI * 2)
      context.fill()
      continue
    }
    context.beginPath()
    context.moveTo(points[0].x * bounds.width, points[0].y * bounds.height)
    for (let index = 1; index < points.length; index += 1) {
      context.lineTo(points[index].x * bounds.width, points[index].y * bounds.height)
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
      setError('Connection lost. Reconnecting to the shared board…')
    }
    function onStrokeStart(stroke) {
      setStrokes((current) => current.some((item) => item.id === stroke.id) ? current : [...current, stroke])
    }
    function onStrokePoints({ strokeId, points }) {
      setStrokes((current) => current.map((stroke) => (
        stroke.id === strokeId ? { ...stroke, points: [...stroke.points, ...points] } : stroke
      )))
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
            {connected ? '24h left · Live board' : 'Connecting…'}
          </span>
        </div>
      </header>
      {error && <p className="whiteboard-error" role="status">{error}</p>}
      <div className="whiteboard-canvas-wrap">
        <div className="whiteboard-side-tools" aria-hidden="true">
          <span>↖</span><span>✎</span><span>◫</span><span>▢</span><span>＋</span>
        </div>
        <div className="whiteboard-undo-tools" aria-hidden="true"><span>↶</span><span>↷</span></div>
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
