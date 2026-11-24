import { io, type Socket } from 'socket.io-client'

// WebSockets cannot be proxied by a Vercel rewrite, so the socket connects to
// the API host directly. The session cookie is SameSite=Strict and is not sent
// cross-site, hence the short-lived handshake token.
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin

let socket: Socket | null = null

async function socketAuth(callback: (data: Record<string, unknown>) => void) {
  try {
    const response = await fetch('/api/auth/socket-token', { credentials: 'include' })
    if (!response.ok) throw new Error('Socket token request failed')
    const data = await response.json()
    callback({ portal: 'admin', token: data.token })
  } catch {
    callback({ portal: 'admin' })
  }
}

export function connectSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      withCredentials: true,
      auth: socketAuth,
      transports: ['websocket'],
      reconnectionDelayMax: 10_000,
    })
  }
  return socket
}

export function disconnectSocket() {
  socket?.disconnect()
  socket = null
}
