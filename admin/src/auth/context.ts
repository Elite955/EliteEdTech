import { createContext } from 'react'

export type AuthenticatedUser = {
  id: string
  name: string
  email: string
  role: string
  roleCode: string
}

export type Permission = {
  module: string
  action: string
}

export type AuthContextValue = {
  user: AuthenticatedUser | null
  permissions: Permission[]
  loading: boolean
  setSession: (user: AuthenticatedUser, permissions: Permission[]) => void
  logout: () => Promise<void>
  can: (module: string, action: string) => boolean
}

export const AuthContext = createContext<AuthContextValue | null>(null)
