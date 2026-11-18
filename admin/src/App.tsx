import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { PortalRedirect } from './auth/PortalRedirect'
import { portalUrlForUser } from './auth/roleRoutes'
import { useAuth } from './auth/useAuth'
import { AdminLayout } from './components/AdminLayout'
import { PageLoader } from './components/PageLoader'

const LoginPage = lazy(() => import('./pages/LoginPage').then(({ LoginPage }) => ({ default: LoginPage })))
const PasswordResetPage = lazy(() => import('./pages/PasswordResetPage').then(({ PasswordResetPage }) => ({ default: PasswordResetPage })))
const Dashboard = lazy(() => import('./pages/Dashboard').then(({ Dashboard }) => ({ default: Dashboard })))
const UserDirectory = lazy(() => import('./pages/UserDirectory').then(({ UserDirectory }) => ({ default: UserDirectory })))
const AdminDirectory = lazy(() => import('./pages/AdminDirectory').then(({ AdminDirectory }) => ({ default: AdminDirectory })))
const MeetingChecks = lazy(() => import('./pages/MeetingChecks').then(({ MeetingChecks }) => ({ default: MeetingChecks })))
const ActiveSessionsPage = lazy(() => import('./pages/ActiveSessionsPage').then(({ ActiveSessionsPage }) => ({ default: ActiveSessionsPage })))
const ModulePage = lazy(() => import('./pages/ModulePage').then(({ ModulePage }) => ({ default: ModulePage })))

function ProtectedRoutes() {
  const { user, loading } = useAuth()
  if (loading) return <PageLoader label="Checking your account session…" fullScreen />
  if (!user) return <Navigate to="/sign-in" replace />
  const portalUrl = portalUrlForUser(user)
  if (portalUrl) return <PortalRedirect url={portalUrl} />
  return (
    <AdminLayout>
      <Suspense fallback={<PageLoader label="Loading this page…" />}>
        <Outlet />
      </Suspense>
    </AdminLayout>
  )
}

function RoleRoutes() {
  const { user, loading } = useAuth()
  if (loading) return <PageLoader label="Checking your account session…" fullScreen />
  if (!user) return <Navigate to="/sign-in" replace />
  const portalUrl = portalUrlForUser(user)
  if (portalUrl) return <PortalRedirect url={portalUrl} />
  return <Navigate to="/dashboard" replace />
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<PageLoader label="Opening the admin console…" fullScreen />}>
          <Routes>
            <Route path="/sign-in" element={<LoginPage />} />
            <Route path="/reset-password" element={<PasswordResetPage />} />
            <Route path="/student/dashboard" element={<RoleRoutes />} />
            <Route path="/teacher/dashboard" element={<RoleRoutes />} />
            <Route element={<ProtectedRoutes />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/students" element={<UserDirectory role="student" />} />
              <Route path="/teachers" element={<UserDirectory role="teacher" />} />
              <Route path="/admins" element={<AdminDirectory />} />
              <Route path="/meeting-checks" element={<MeetingChecks />} />
              <Route path="/sessions" element={<ActiveSessionsPage />} />
              <Route path="/modules/:module" element={<ModulePage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
