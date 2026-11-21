const API_ORIGIN = import.meta.env.VITE_API_URL || ''

export function apiUrl(path) {
  const normalized = path.startsWith('/api/')
    ? path
    : `/api${path.startsWith('/') ? path : `/${path}`}`
  return `${API_ORIGIN}${normalized}`
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', 'X-Portal': 'student', ...(options.headers || {}) }
  let res
  try {
    res = await fetch(apiUrl(path), { ...options, headers, credentials: 'include' })
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

export async function recordAttendance(sessionId, action) {
  try {
    return await request(`/sessions/${sessionId}/attendance`, {
      method: 'POST',
      body: JSON.stringify({ action })
    })
  } catch {
    return null
  }
}
