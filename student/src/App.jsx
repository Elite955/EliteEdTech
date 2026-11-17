import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import TeacherDashboard from './pages/TeacherDashboard'
import BrowseTeachers from './pages/BrowseTeachers'
import RequestSlot from './pages/RequestSlot'
import MyBookings from './pages/MyBookings'
import PaymentHistory from './pages/PaymentHistory'
import SessionHistory from './pages/SessionHistory'
import Chat from './pages/Chat'
import Feedback from './pages/Feedback'

export default function App() {
  return (
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
        <Route path="/chat" element={<Chat />} />
        <Route path="/feedback" element={<Feedback />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
