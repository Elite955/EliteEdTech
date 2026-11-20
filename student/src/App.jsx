import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import PageLoader from './components/PageLoader'
import ProtectedRoute from './components/ProtectedRoute'

const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const TeacherDashboard = lazy(() => import('./pages/TeacherDashboard'))
const BrowseTeachers = lazy(() => import('./pages/BrowseTeachers'))
const RequestSlot = lazy(() => import('./pages/RequestSlot'))
const MyBookings = lazy(() => import('./pages/MyBookings'))
const PaymentHistory = lazy(() => import('./pages/PaymentHistory'))
const SessionHistory = lazy(() => import('./pages/SessionHistory'))
const Feedback = lazy(() => import('./pages/Feedback'))

export default function App() {
  return (
    <Suspense fallback={<PageLoader label="Opening the student portal…" />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Dashboard />} />
          <Route path="/teacher" element={<TeacherDashboard />} />
          <Route path="/teachers" element={<BrowseTeachers />} />
          <Route path="/request/:teacherId" element={<RequestSlot />} />
          <Route path="/bookings" element={<MyBookings />} />
          <Route path="/payments" element={<PaymentHistory />} />
          <Route path="/sessions" element={<SessionHistory />} />
          <Route path="/chat" element={<Navigate to="/" replace />} />
          <Route path="/feedback" element={<Feedback />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
