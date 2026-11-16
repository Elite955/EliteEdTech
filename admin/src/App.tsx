import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { homePathForUser } from './auth/roleRoutes'
import { useAuth } from './auth/useAuth'
import { AdminLayout } from './components/AdminLayout'
import { AdminDirectory, Dashboard, LoginPage, ModulePage, PasswordResetPage, RoleLandingPage, RoleManagement, UserDirectory } from './pages'

function ProtectedRoutes() {
  const { user, loading } = useAuth()
  if (loading) return <div className="app-loading"><span className="spinner" /> Checking your account session…</div>
  if (!user) return <Navigate to="/sign-in" replace />
  if (user.roleCode === 'student' || user.roleCode === 'teacher') {
    return <Navigate to={homePathForUser(user)} replace />
  }
  return <AdminLayout><Outlet /></AdminLayout>
}

function RoleRoutes({ role }: { role: 'student' | 'teacher' }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="app-loading"><span className="spinner" /> Checking your account session…</div>
  if (!user) return <Navigate to="/sign-in" replace />
  if (user.roleCode !== role) return <Navigate to={homePathForUser(user)} replace />
  return <RoleLandingPage role={role} />
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/sign-in" element={<LoginPage />} />
          <Route path="/reset-password" element={<PasswordResetPage />} />
          <Route path="/student/dashboard" element={<RoleRoutes role="student" />} />
          <Route path="/teacher/dashboard" element={<RoleRoutes role="teacher" />} />
          <Route element={<ProtectedRoutes />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/students" element={<UserDirectory role="student" />} />
            <Route path="/teachers" element={<UserDirectory role="teacher" />} />
            <Route path="/admins" element={<AdminDirectory />} />
            <Route path="/roles" element={<RoleManagement />} />
            <Route path="/modules/:module" element={<ModulePage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
