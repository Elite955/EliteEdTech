import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const studentLinks = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/teachers', label: 'Browse Teachers' },
  { to: '/bookings', label: 'My Bookings' },
  { to: '/payments', label: 'Payments' },
  { to: '/sessions', label: 'Sessions' },
  { to: '/chat', label: 'Chat' },
  { to: '/feedback', label: 'Feedback' }
]

const teacherLinks = [
  { to: '/teacher', label: 'Dashboard' },
  { to: '/chat', label: 'Chat' }
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const isTeacher = user?.roleCode === 'teacher'
  const links = isTeacher ? teacherLinks : studentLinks

  if (isTeacher && location.pathname === '/') {
    return <Navigate to="/teacher" replace />
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          EDTECH <span>{isTeacher ? 'Teacher' : 'Student'}</span>
        </div>
        <nav>
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="userbox">
          <span>{user?.name}</span>
          <button
            onClick={() => {
              logout()
              navigate('/login')
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
