import { PortalWorkspace } from './PortalWorkspace'

export function RoleLandingPage({ role }: { role: 'student' | 'teacher' }) {
  return <PortalWorkspace role={role} />
}
