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

const RETRY_DELAYS = [800, 1800, 3500]

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', 'X-Portal': 'student', ...(options.headers || {}) }
  let res
  let text = ''
  try {
    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt += 1) {
      res = await fetch(apiUrl(path), { ...options, headers, credentials: 'include' })
      text = await res.text()
      // Render's free tier sleeps; the first request can time out in Vercel's
      // proxy and return a non-JSON 502/503. Retry while it wakes up.
      const proxyTimeout = [502, 503, 504].includes(res.status) && !text.trim().startsWith('{')
      if (!proxyTimeout || attempt === RETRY_DELAYS.length) break
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[attempt]))
    }
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Please check your connection and try again.')
  }
  let body = null
  try { body = JSON.parse(text || 'null') } catch {}
  if (!res.ok) {
    const message = body?.error || ([502, 503, 504].includes(res.status)
      ? 'The server is waking up. Please try again in a few seconds.'
      : `Request failed (${res.status})`)
    throw new ApiError(res.status, message)
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
