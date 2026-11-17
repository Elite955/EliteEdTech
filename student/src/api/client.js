const API_BASE = import.meta.env.VITE_API_URL || '/api'

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  let res
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'include' })
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Run start-dev.cmd in the one-to-one folder, then try again.')
  }
  let body = null
  try {
    body = await res.json()
  } catch {}
  if (!res.ok) {
    throw new ApiError(res.status, body?.error || `Request failed (${res.status})`)
  }
  return body
}

export const api = {
  get: (path) => request(path),
  post: (path, data) => request(path, { method: 'POST', body: JSON.stringify(data ?? {}) }),
  patch: (path, data) => request(path, { method: 'PATCH', body: JSON.stringify(data ?? {}) })
}
