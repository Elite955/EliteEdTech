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

const unauthenticatedAuthPaths = new Set([
  '/auth/login',
  '/auth/mfa/confirm',
  '/auth/mfa/verify',
  '/auth/password-reset/request',
  '/auth/password-reset/confirm',
])

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const apiPath = path.startsWith('/api/') ? path.slice(4) : path
  const response = await fetch(path.startsWith('/api/') ? path : `/api${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'X-Portal': 'admin',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })

  if (response.status === 204) return undefined as T

  const payload = await response.json().catch(() => null) as Record<string, unknown> | null
  if (!response.ok) {
    if (
      response.status === 401 &&
      !unauthenticatedAuthPaths.has(apiPath) &&
      typeof window !== 'undefined'
    ) {
      window.dispatchEvent(new Event('edtech:session-expired'))
    }
    const message = typeof payload?.error === 'string'
      ? payload.error
      : typeof payload?.message === 'string'
        ? payload.message
        : `Request failed (${response.status}).`
    throw new ApiError(message, response.status, payload)
  }
  return payload as T
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}
