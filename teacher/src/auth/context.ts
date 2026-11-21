import { createContext } from 'react'
import type { User } from '../lib/types'

export interface LoginResult {
  requiresMfa?: boolean
  requiresMfaSetup?: boolean
  challenge?: string
  otpAuthUrl?: string
  accountName?: string
  redirected?: boolean
}

export interface AuthState {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<LoginResult>
  confirmMfa: (challenge: string, code: string) => Promise<void>
  verifyMfa: (challenge: string, code: string) => Promise<void>
  updateUser: (patch: Partial<User>) => void
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)
