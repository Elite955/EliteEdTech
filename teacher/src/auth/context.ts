import { createContext } from 'react'
import type { User } from '../lib/types'

export interface AuthState {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<{ requiresMfa?: boolean; challenge?: string; redirected?: boolean }>
  verifyMfa: (challenge: string, code: string) => Promise<void>
  updateUser: (patch: Partial<User>) => void
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)
