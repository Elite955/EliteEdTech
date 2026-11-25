export class ApiError extends Error {
  status: number
  data: Record<string, unknown> | null

  constructor(message: string, status: number, data: Record<string, unknown> | null = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

const API_ORIGIN = import.meta.env.VITE_API_URL || ''

const RETRY_DELAYS = [800, 1800, 3500]

export function apiUrl(path: string): string {
  const normalized = path.startsWith('/api/')
    ? path
    : `/api${path.startsWith('/') ? path : `/${path}`}`
  return `${API_ORIGIN}${normalized}`
}

const unauthenticatedAuthPaths = new Set([
  '/auth/login',
  '/auth/mfa/confirm',
  '/auth/mfa/verify',
  '/auth/password-reset/request',
  '/auth/password-reset/confirm',
])

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const apiPath = path.startsWith('/api/') ? path.slice(4) : path
  let response: Response | null = null
  let text = ''
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt += 1) {
    response = await fetch(apiUrl(path), {
      ...options,
      credentials: 'include',
      headers: {
        'X-Portal': 'admin',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    })
    text = await response.text()
    const proxyTimeout = [502, 503, 504].includes(response!.status) && !text.trim().startsWith('{')
    if (!proxyTimeout || attempt === RETRY_DELAYS.length) break
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[attempt]))
  }

  if (response!.status === 204) return undefined as T

  const payload = (() => { try { return JSON.parse(text || 'null') } catch { return null } })() as Record<string, unknown> | null
  if (!response!.ok) {
    if (
      response!.status === 401 &&
      !unauthenticatedAuthPaths.has(apiPath) &&
      typeof window !== 'undefined'
    ) {
      window.dispatchEvent(new Event('edtech:session-expired'))
    }
    const fallback = [502, 503, 504].includes(response!.status)
      ? 'The server is waking up. Please try again in a few seconds.'
      : `Request failed (${response!.status}).`
    const message = typeof payload?.error === 'string'
      ? payload.error
      : typeof payload?.message === 'string'
        ? payload.message
        : fallback
    throw new ApiError(message, response!.status, payload)
  }
  return payload as T
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}
