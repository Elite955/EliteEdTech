const ADMIN_PORTAL_URL = import.meta.env.VITE_ADMIN_PORTAL_URL ?? 'http://localhost:5173'
const STUDENT_PORTAL_URL = import.meta.env.VITE_STUDENT_PORTAL_URL ?? 'http://localhost:5175'

export function portalUrlForRole(roleCode: string) {
  return roleCode === 'student' ? STUDENT_PORTAL_URL : ADMIN_PORTAL_URL
}

export function redirectToPortal(roleCode: string) {
  window.location.replace(portalUrlForRole(roleCode))
}
