import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AuthContext, type AuthenticatedUser, type Permission } from './context'
import { api } from '../lib/api'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null)
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    api<{ user: AuthenticatedUser; permissions: Permission[] }>('/auth/me')
      .then((session) => {
        if (active) {
          setUser(session.user)
          setPermissions(session.permissions)
        }
      })
      .catch(() => {
        if (active) {
          setUser(null)
          setPermissions([])
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  const setSession = useCallback((nextUser: AuthenticatedUser, nextPermissions: Permission[]) => {
    setUser(nextUser)
    setPermissions(nextPermissions)
  }, [])

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' })
    setUser(null)
    setPermissions([])
  }, [])

  const can = useCallback((module: string, action: string) => (
    user?.roleCode === 'super_admin' ||
    permissions.some((permission) => permission.module === module && permission.action === action)
  ), [permissions, user])

  const value = useMemo(() => ({ user, permissions, loading, setSession, logout, can }), [user, permissions, loading, setSession, logout, can])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
