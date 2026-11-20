import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { api } from '../lib/api'
import { redirectToPortal } from '../lib/portals'
import type { User } from '../lib/types'
import { AuthContext } from './context'

interface LoginResponse {
  user?: User
  requiresMfa?: boolean
  challenge?: string
}

interface MeResponse {
  user: User
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchMe = useCallback(async () => {
    try {
      const data = await api<MeResponse>('/auth/me')
      if (data.user.roleCode === 'teacher') {
        setUser(data.user)
      } else {
        setUser(null)
        redirectToPortal(data.user.roleCode)
      }
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMe()
    const onExpired = () => { setUser(null); setLoading(false) }
    window.addEventListener('edtech:session-expired', onExpired)
    return () => window.removeEventListener('edtech:session-expired', onExpired)
  }, [fetchMe])

  const login = useCallback(async (email: string, password: string) => {
    const data = await api<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, portal: 'teacher' }),
    })
    if (data.requiresMfa && data.challenge) {
      return { requiresMfa: true, challenge: data.challenge }
    }
    if (data.user) {
      if (data.user.roleCode !== 'teacher') {
        redirectToPortal(data.user.roleCode)
        return { redirected: true }
      }
      setUser(data.user)
    }
    return {}
  }, [])

  const verifyMfa = useCallback(async (challenge: string, code: string) => {
    const data = await api<LoginResponse>('/auth/mfa/verify', {
      method: 'POST',
      body: JSON.stringify({ challenge, code }),
    })
    if (data.user) {
      if (data.user.roleCode !== 'teacher') {
        redirectToPortal(data.user.roleCode)
        return
      }
      setUser(data.user)
    }
  }, [])

  const updateUser = useCallback((patch: Partial<User>) => {
    setUser((current) => current ? { ...current, ...patch } : current)
  }, [])

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' })
    } finally {
      setUser(null)
    }
  }, [])

  return (
    <AuthContext value={{ user, loading, login, verifyMfa, updateUser, logout }}>
      {children}
    </AuthContext>
  )
}
