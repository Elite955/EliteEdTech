import { createContext, useContext, useMemo, useState } from 'react'
import { api } from '../api/client'
import { disconnectSocket } from '../api/socket'

const AuthContext = createContext(null)
const USER_KEY = 'edtech_student_user'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY))
    } catch {
      return null
    }
  })

  const value = useMemo(
    () => ({
      user,
      isCensored: user?.age >= 10 && user?.age <= 12,
      async login(u) {
        localStorage.setItem(USER_KEY, JSON.stringify(u))
        setUser(u)
      },
      async logout() {
        try {
          await api.post('/auth/logout')
        } catch {}
        localStorage.removeItem(USER_KEY)
        disconnectSocket()
        setUser(null)
      }
    }),
    [user]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
