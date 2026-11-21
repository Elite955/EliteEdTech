import { Suspense, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Calendar,
  Clock,
  ClipboardList,
  Video,
  Star,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  User,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import { api } from '../lib/api'
import { ProfileDialog } from './ProfileDialog'
import { PageLoader } from './PageLoader'
import EliteLoader, { waitForEliteLoader } from './EliteLoader'
import GlobalChat from './GlobalChat'

const navigation = [
  {
    label: 'Overview',
    items: [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Teaching',
    items: [
      { to: '/availability', label: 'Availability', icon: Calendar },
      { to: '/bookings', label: 'Booking Queue', icon: ClipboardList },
      { to: '/schedule', label: 'Schedule', icon: Clock },
    ],
  },
  {
    label: 'Sessions',
    items: [{ to: '/sessions', label: 'My Sessions', icon: Video }],
  },
  {
    label: 'Feedback',
    items: [{ to: '/feedback', label: 'Student Feedback', icon: Star }],
  },
]

export function TeacherLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [profileDialogOpen, setProfileDialogOpen] = useState(false)
  const profileButtonRef = useRef<HTMLButtonElement>(null)
  const [pendingBookings, setPendingBookings] = useState(0)
  const initial = user?.name?.charAt(0).toUpperCase() ?? 'T'
  const allNavItems = navigation.flatMap((group) => group.items)
  const activeNav = allNavItems.find((item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)) ?? allNavItems[0]
  const PageIcon = activeNav.icon

  useEffect(() => {
    setProfileOpen(false)
    setProfileDialogOpen(false)
    setChatOpen(false)
  }, [location.pathname])

  useEffect(() => {
    let active = true

    async function loadPendingBookings() {
      const data = await api<{ stats: { pendingBookings: number } }>('/teacher/dashboard/stats').catch(() => null)
      if (!active || !data) return
      setPendingBookings(data.stats.pendingBookings)
    }

    void loadPendingBookings()
    const interval = window.setInterval(loadPendingBookings, 20000)
    const refresh = () => { void loadPendingBookings() }
    window.addEventListener('focus', refresh)
    window.addEventListener('edtech:teacher-bookings-changed', refresh)

    return () => {
      active = false
      window.clearInterval(interval)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('edtech:teacher-bookings-changed', refresh)
    }
  }, [])

  function toggleChat() {
    setProfileOpen(false)
    setChatOpen((value) => !value)
  }

  async function handleLogout() {
    const startedAt = performance.now()
    setProfileOpen(false)
    setLoggingOut(true)
    try {
      await logout()
      await waitForEliteLoader(startedAt)
    } finally {
      navigate('/sign-in', { replace: true })
    }
  }

  return (
    <div className={`teacher-shell${collapsed ? ' is-collapsed' : ''}`}>
      <aside className="sidebar" id="teacher-sidebar">
        <div className="sidebar-brand">
          <img className="brand-logo-img" src="/elite-logo-sm.png" alt="Elite" />
          <button
            type="button"
            className="sidebar-collapse icon-button"
            aria-controls="teacher-sidebar"
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Teacher navigation">
          {navigation.map((group) => (
            <div className="nav-group" key={group.label}>
              {!collapsed && <div className="nav-group-label">{group.label}</div>}
              {group.items.map(({ to, label, icon: Icon }) => {
                const pending = to === '/bookings' ? pendingBookings : 0
                return (
                  <NavLink
                    key={to}
                    to={to}
                    title={pending > 0 ? `${label} (${pending} pending)` : label}
                    aria-label={pending > 0 ? `${label}, ${pending} pending` : collapsed ? label : undefined}
                    className={({ isActive }) => `nav-link${isActive ? ' active' : ''}${pending > 0 ? ' has-pending' : ''}`}
                  >
                    <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
                    {pending > 0 && <b className="nav-count" aria-hidden="true">{pending > 99 ? '99+' : pending}</b>}
                  </NavLink>
                )
              })}
            </div>
          ))}
        </nav>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div className="topbar-heading">
            <span className="topbar-icon" key={location.pathname} aria-hidden="true"><PageIcon size={17} strokeWidth={1.9} /></span>
            <h1>{activeNav.label}</h1>
          </div>
          <div className="topbar-actions">
            <div className="profile-wrap">
              <button
                type="button"
                ref={profileButtonRef}
                className="profile-button"
                onClick={() => setProfileOpen((value) => !value)}
                aria-expanded={profileOpen}
              >
                <span className="avatar">{initial}</span>
                <span className="profile-text"><strong>{user?.name}</strong><small>{user?.role}</small></span>
                <ChevronDown size={16} />
              </button>
              {profileOpen && (
                <div className="profile-menu">
                  <span>{user?.email}</span>
                  <button
                    type="button"
                    className="profile-menu-edit"
                    onClick={() => {
                      setProfileOpen(false)
                      setProfileDialogOpen(true)
                    }}
                  >
                    <User size={15} /> Edit profile
                  </button>
                  <button type="button" onClick={handleLogout}><LogOut size={15} /> Sign out</button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="page-content">
          <Suspense fallback={<PageLoader label="Loading this page…" />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      {!chatOpen && (
        <button
          type="button"
          className="chat-launcher"
          aria-label="Open global chat"
          aria-controls="global-chat"
          data-ui-sound="open"
          onClick={toggleChat}
        >
          <MessageCircle size={19} />
          <span>Chat</span>
        </button>
      )}
      {profileDialogOpen && <ProfileDialog returnFocusRef={profileButtonRef} onClose={() => setProfileDialogOpen(false)} />}
      {chatOpen && <GlobalChat onClose={() => setChatOpen(false)} />}
      {loggingOut && <EliteLoader label="Signing out" />}
    </div>
  )
}
