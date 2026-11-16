import type { AuthenticatedUser } from './context'

export function homePathForUser(user: Pick<AuthenticatedUser, 'roleCode'> | null) {
  if (!user) return '/sign-in'
  if (user.roleCode === 'student') return '/student/dashboard'
  if (user.roleCode === 'teacher') return '/teacher/dashboard'
  return '/dashboard'
}
