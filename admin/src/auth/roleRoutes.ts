import type { AuthenticatedUser } from './context'

const STUDENT_PORTAL_URL = import.meta.env.VITE_STUDENT_PORTAL_URL ?? 'http://localhost:5175'
const TEACHER_PORTAL_URL = import.meta.env.VITE_TEACHER_PORTAL_URL ?? 'http://localhost:5174'

export function homePathForUser(user: Pick<AuthenticatedUser, 'roleCode'> | null) {
  if (!user) return '/sign-in'
  if (user.roleCode === 'student') return '/student/dashboard'
  if (user.roleCode === 'teacher') return '/teacher/dashboard'
  return '/dashboard'
}

export function portalUrlForUser(user: Pick<AuthenticatedUser, 'roleCode'> | null) {
  if (!user) return null
  if (user.roleCode === 'student') return STUDENT_PORTAL_URL
  if (user.roleCode === 'teacher') return TEACHER_PORTAL_URL
  return null
}
