import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { useAuth } from './auth/useAuth'
import { TeacherLayout } from './components/TeacherLayout'
import { PageLoader } from './components/PageLoader'

const LoginPage = lazy(() => import('./pages/LoginPage').then(({ LoginPage }) => ({ default: LoginPage })))
const RegisterPage = lazy(() => import('./pages/RegisterPage').then(({ RegisterPage }) => ({ default: RegisterPage })))
const DashboardPage = lazy(() => import('./pages/DashboardPage').then(({ DashboardPage }) => ({ default: DashboardPage })))
const AvailabilityPage = lazy(() => import('./pages/AvailabilityPage').then(({ AvailabilityPage }) => ({ default: AvailabilityPage })))
const BookingQueuePage = lazy(() => import('./pages/BookingQueuePage').then(({ BookingQueuePage }) => ({ default: BookingQueuePage })))
const SessionsPage = lazy(() => import('./pages/SessionsPage').then(({ SessionsPage }) => ({ default: SessionsPage })))
const SchedulePage = lazy(() => import('./pages/SchedulePage').then(({ SchedulePage }) => ({ default: SchedulePage })))
const FeedbackPage = lazy(() => import('./pages/FeedbackPage').then(({ FeedbackPage }) => ({ default: FeedbackPage })))
const ConductClassPage = lazy(() => import('./pages/ConductClassPage').then(({ ConductClassPage }) => ({ default: ConductClassPage })))
const WhiteboardOnlyPage = lazy(() => import('./pages/WhiteboardOnlyPage').then(({ WhiteboardOnlyPage }) => ({ default: WhiteboardOnlyPage })))

function ProtectedRoutes() {
  const { user, loading } = useAuth()
  if (loading) return <PageLoader label="Checking your session…" fullScreen />
  if (!user) return <Navigate to="/sign-in" replace />
  if (user.roleCode !== 'teacher') {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-bold text-slate-900 mb-2">Access Denied</h2>
          <p className="text-slate-500">
            This dashboard is for teacher accounts only. Your account role is "{user.role}".
          </p>
        </div>
      </div>
    )
  }
  return <TeacherLayout />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<PageLoader label="Opening the teacher portal…" fullScreen />}>
          <Routes>
            <Route path="/sign-in" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/classroom/whiteboard/:sessionId" element={<WhiteboardOnlyPage />} />
            <Route element={<ProtectedRoutes />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/availability" element={<AvailabilityPage />} />
              <Route path="/bookings" element={<BookingQueuePage />} />
              <Route path="/sessions" element={<SessionsPage />} />
              <Route path="/sessions/:sessionId" element={<ConductClassPage />} />
              <Route path="/schedule" element={<SchedulePage />} />
              <Route path="/feedback" element={<FeedbackPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  )
}
