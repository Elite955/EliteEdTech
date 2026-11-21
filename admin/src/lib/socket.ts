import { io, type Socket } from 'socket.io-client'

let socket: Socket | null = null

export function connectSocket(): Socket {
  if (!socket) {
    socket = io(import.meta.env.VITE_SOCKET_URL || '/', {
      withCredentials: true,
      auth: { portal: 'admin' },
      transports: ['websocket'],
    })
  }
  return socket
}

export function disconnectSocket() {
  socket?.disconnect()
  socket = null
}
