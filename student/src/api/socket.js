import { io } from 'socket.io-client'

// The API runs on its own host (Render), and WebSockets cannot be proxied by a
// Vercel rewrite. Point the socket straight at the API; auth is carried by a
// short-lived token because the session cookie is SameSite=Strict.
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin

let socket = null

async function socketAuth(callback) {
  try {
    const response = await fetch('/api/auth/socket-token', { credentials: 'include' })
    if (!response.ok) throw new Error('Socket token request failed')
    const data = await response.json()
    callback({ portal: 'student', token: data.token })
  } catch {
    callback({ portal: 'student' })
  }
}

export function connectSocket() {
  if (socket) return socket
  socket = io(SOCKET_URL, {
    withCredentials: true,
    auth: socketAuth,
    transports: ['websocket'],
    reconnectionDelayMax: 10_000,
  })
  return socket
}

export function getSocket() {
  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}
