export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path.startsWith('/api/') ? path : `/api${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })

  if (response.status === 204) return undefined as T

  const payload = await response.json().catch(() => null) as { error?: string; message?: string } | null
  if (!response.ok) {
    throw new ApiError(payload?.error ?? payload?.message ?? `Request failed (${response.status}).`, response.status)
  }
  return payload as T
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}
