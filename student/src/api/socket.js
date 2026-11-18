import { io } from 'socket.io-client'

let socket = null

export function connectSocket() {
  if (socket) return socket
  socket = io(import.meta.env.VITE_SOCKET_URL || '/', {
    withCredentials: true,
    auth: { portal: 'student' },
    transports: ['websocket']
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
