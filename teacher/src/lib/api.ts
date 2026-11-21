export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

const API_ORIGIN = import.meta.env.VITE_API_URL || ''

export function apiUrl(path: string): string {
  const normalized = path.startsWith('/api/')
    ? path
    : `/api${path.startsWith('/') ? path : `/${path}`}`
  return `${API_ORIGIN}${normalized}`
}

const unauthenticatedPaths = new Set([
  '/auth/register',
  '/auth/login',
  '/auth/mfa/confirm',
  '/auth/mfa/verify',
  '/auth/password-reset/request',
  '/auth/password-reset/confirm',
])

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const apiPath = path.startsWith('/api/') ? path.slice(4) : path
  const response = await fetch(apiUrl(path), {
    ...options,
    credentials: 'include',
    headers: {
      'X-Portal': 'teacher',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })

  if (response.status === 204) return undefined as T

  const payload = await response.json().catch(() => null) as { error?: string; message?: string } | null
  if (!response.ok) {
    if (
      response.status === 401 &&
      !unauthenticatedPaths.has(apiPath) &&
      typeof window !== 'undefined'
    ) {
      window.dispatchEvent(new Event('edtech:session-expired'))
    }
    throw new ApiError(payload?.error ?? payload?.message ?? `Request failed (${response.status}).`, response.status)
  }
  return payload as T
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}
